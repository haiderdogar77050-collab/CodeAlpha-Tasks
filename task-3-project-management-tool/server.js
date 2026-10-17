const express=require("express");
const path=require("path");
const fs=require("fs");
const http=require("http");
const bcrypt=require("bcryptjs");
const session=require("express-session");
const WebSocket=require("ws");

const app=express(), server=http.createServer(app), wss=new WebSocket.Server({server});
const PORT=3001, DB_FILE=path.join(__dirname,"database.json");

function seed(){
 const h=bcrypt.hashSync("demo123",10);
 return {
  users:[
   {id:1,name:"Demo User",email:"demo@example.com",password:h},
   {id:2,name:"Sarah Khan",email:"sarah@example.com",password:h},
   {id:3,name:"Ali Raza",email:"ali@example.com",password:h}
  ],
  projects:[{id:1,name:"Website Launch",description:"Build and launch the company website.",ownerId:1,memberIds:[1,2,3],createdAt:new Date().toISOString()}],
  tasks:[
   {id:1,projectId:1,title:"Design homepage",description:"Create homepage UI",status:"Todo",assigneeId:2,createdBy:1,createdAt:new Date().toISOString()},
   {id:2,projectId:1,title:"Build Express API",description:"Implement project APIs",status:"In Progress",assigneeId:3,createdBy:1,createdAt:new Date().toISOString()},
   {id:3,projectId:1,title:"Project setup",description:"Initialize repository",status:"Done",assigneeId:1,createdBy:1,createdAt:new Date().toISOString()}
  ],
  comments:[]
 };
}
let db=fs.existsSync(DB_FILE)?JSON.parse(fs.readFileSync(DB_FILE,"utf8")):seed();
if(!fs.existsSync(DB_FILE))fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));
const save=()=>fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));
const nextId=a=>a.length?Math.max(...a.map(x=>Number(x.id)))+1:1;
const me=req=>db.users.find(u=>u.id===req.session.userId);
const pubUser=u=>u&&({id:u.id,name:u.name,email:u.email});
const auth=(req,res,next)=>me(req)?next():res.status(401).json({error:"Please login first."});
function broadcast(projectId,payload){const msg=JSON.stringify(payload);wss.clients.forEach(c=>{if(c.readyState===WebSocket.OPEN&&c.projectId===Number(projectId))c.send(msg)})}

app.use(express.json());app.use(express.urlencoded({extended:true}));
app.use(session({secret:"pm-demo-secret",resave:false,saveUninitialized:false,cookie:{maxAge:86400000}}));
app.use(express.static(path.join(__dirname,"public")));
app.get("/",(_,res)=>res.sendFile(path.join(__dirname,"views","index.html")));
app.get("/project.html",(_,res)=>res.sendFile(path.join(__dirname,"views","project.html")));
app.get("/login.html",(_,res)=>res.sendFile(path.join(__dirname,"views","login.html")));
app.get("/register.html",(_,res)=>res.sendFile(path.join(__dirname,"views","register.html")));

app.get("/api/me",(req,res)=>res.json({user:me(req)?pubUser(me(req)):null}));
app.post("/api/register",(req,res)=>{
 const {name,email,password}=req.body;
 if(!name||!email||!password||password.length<6)return res.status(400).json({error:"All fields required; password must be 6+ characters."});
 if(db.users.some(u=>u.email===email.toLowerCase()))return res.status(409).json({error:"Email already registered."});
 const u={id:nextId(db.users),name:name.trim(),email:email.toLowerCase(),password:bcrypt.hashSync(password,10)};
 db.users.push(u);save();req.session.userId=u.id;res.json({user:pubUser(u)});
});
app.post("/api/login",(req,res)=>{
 const u=db.users.find(x=>x.email===(req.body.email||"").toLowerCase());
 if(!u||!bcrypt.compareSync(req.body.password||"",u.password))return res.status(401).json({error:"Invalid credentials."});
 req.session.userId=u.id;res.json({user:pubUser(u)});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({message:"Logged out"})));

app.get("/api/users",auth,(req,res)=>res.json(db.users.map(pubUser)));

app.get("/api/projects",auth,(req,res)=>{
 const uid=me(req).id;
 res.json(db.projects.filter(p=>p.memberIds.includes(uid)).map(p=>({...p,owner:pubUser(db.users.find(u=>u.id===p.ownerId))})));
});
app.post("/api/projects",auth,(req,res)=>{
 const name=(req.body.name||"").trim(),description=(req.body.description||"").trim();
 if(!name)return res.status(400).json({error:"Project name required."});
 const p={id:nextId(db.projects),name,description,ownerId:me(req).id,memberIds:[me(req).id],createdAt:new Date().toISOString()};
 db.projects.push(p);save();res.json(p);
});
app.get("/api/projects/:id",auth,(req,res)=>{
 const p=db.projects.find(x=>x.id===Number(req.params.id));
 if(!p)return res.status(404).json({error:"Project not found."});
 if(!p.memberIds.includes(me(req).id))return res.status(403).json({error:"You are not a project member."});
 const tasks=db.tasks.filter(t=>t.projectId===p.id).map(t=>({...t,assignee:t.assigneeId?pubUser(db.users.find(u=>u.id===t.assigneeId)):null,comments:db.comments.filter(c=>c.taskId===t.id).map(c=>({...c,user:pubUser(db.users.find(u=>u.id===c.userId))}))}));
 res.json({...p,owner:pubUser(db.users.find(u=>u.id===p.ownerId)),members:p.memberIds.map(id=>pubUser(db.users.find(u=>u.id===id))),tasks});
});
app.post("/api/projects/:id/members",auth,(req,res)=>{
 const p=db.projects.find(x=>x.id===Number(req.params.id));
 if(!p||p.ownerId!==me(req).id)return res.status(403).json({error:"Only the project owner can manage members."});
 const user=db.users.find(u=>u.id===Number(req.body.userId));
 if(!user)return res.status(404).json({error:"User not found."});
 if(!p.memberIds.includes(user.id))p.memberIds.push(user.id);
 save();broadcast(p.id,{type:"project-update"});res.json(p);
});
app.delete("/api/projects/:id/members/:userId",auth,(req,res)=>{
 const p=db.projects.find(x=>x.id===Number(req.params.id));
 if(!p||p.ownerId!==me(req).id)return res.status(403).json({error:"Only the project owner can manage members."});
 p.memberIds=p.memberIds.filter(id=>id!==Number(req.params.userId)||id===p.ownerId);save();res.json(p);
});

app.post("/api/projects/:id/tasks",auth,(req,res)=>{
 const p=db.projects.find(x=>x.id===Number(req.params.id));
 if(!p||!p.memberIds.includes(me(req).id))return res.status(403).json({error:"Not a project member."});
 const title=(req.body.title||"").trim();if(!title)return res.status(400).json({error:"Task title required."});
 const t={id:nextId(db.tasks),projectId:p.id,title,description:(req.body.description||"").trim(),status:["Todo","In Progress","Done"].includes(req.body.status)?req.body.status:"Todo",assigneeId:req.body.assigneeId?Number(req.body.assigneeId):null,createdBy:me(req).id,createdAt:new Date().toISOString()};
 db.tasks.push(t);save();broadcast(p.id,{type:"task-created"});res.json(t);
});
app.put("/api/tasks/:id",auth,(req,res)=>{
 const t=db.tasks.find(x=>x.id===Number(req.params.id)),p=t&&db.projects.find(x=>x.id===t.projectId);
 if(!t||!p||!p.memberIds.includes(me(req).id))return res.status(403).json({error:"Not allowed."});
 if(req.body.title!==undefined)t.title=req.body.title.trim();
 if(req.body.description!==undefined)t.description=req.body.description.trim();
 if(req.body.status!==undefined&&["Todo","In Progress","Done"].includes(req.body.status))t.status=req.body.status;
 if(req.body.assigneeId!==undefined)t.assigneeId=req.body.assigneeId?Number(req.body.assigneeId):null;
 save();broadcast(p.id,{type:"task-updated"});res.json(t);
});
app.delete("/api/tasks/:id",auth,(req,res)=>{
 const t=db.tasks.find(x=>x.id===Number(req.params.id)),p=t&&db.projects.find(x=>x.id===t.projectId);
 if(!t||!p||!p.memberIds.includes(me(req).id))return res.status(403).json({error:"Not allowed."});
 db.tasks=db.tasks.filter(x=>x.id!==t.id);db.comments=db.comments.filter(x=>x.taskId!==t.id);save();broadcast(p.id,{type:"task-deleted"});res.json({message:"Deleted"});
});
app.post("/api/tasks/:id/comments",auth,(req,res)=>{
 const t=db.tasks.find(x=>x.id===Number(req.params.id)),p=t&&db.projects.find(x=>x.id===t.projectId);
 if(!t||!p||!p.memberIds.includes(me(req).id))return res.status(403).json({error:"Not allowed."});
 const content=(req.body.content||"").trim();if(!content)return res.status(400).json({error:"Comment required."});
 const c={id:nextId(db.comments),taskId:t.id,userId:me(req).id,content,createdAt:new Date().toISOString()};db.comments.push(c);save();broadcast(p.id,{type:"comment-added"});res.json(c);
});

wss.on("connection",(socket,req)=>{
 socket.projectId=null;
 socket.on("message",raw=>{try{const m=JSON.parse(raw);if(m.type==="join")socket.projectId=Number(m.projectId)}catch{}});
});

server.listen(PORT,()=>console.log(`Project manager running at http://localhost:${PORT}`));

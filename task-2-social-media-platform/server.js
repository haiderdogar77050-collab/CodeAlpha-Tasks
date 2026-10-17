const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, "database.json");

function seedDB() {
  const demoHash = bcrypt.hashSync("demo123", 10);
  return {
    users: [
      { id: 1, name: "Demo User", username: "demo", email: "demo@example.com", password: demoHash, bio: "Welcome to my mini social network!", avatar: "https://i.pravatar.cc/150?img=12", createdAt: new Date().toISOString() },
      { id: 2, name: "Sarah Khan", username: "sarah", email: "sarah@example.com", password: demoHash, bio: "Designer & coffee lover ☕", avatar: "https://i.pravatar.cc/150?img=47", createdAt: new Date().toISOString() },
      { id: 3, name: "Ali Raza", username: "ali", email: "ali@example.com", password: demoHash, bio: "Building things with JavaScript.", avatar: "https://i.pravatar.cc/150?img=33", createdAt: new Date().toISOString() }
    ],
    posts: [
      { id: 1, userId: 2, content: "Just finished a new UI design. What do you think?", createdAt: new Date(Date.now()-3600000).toISOString() },
      { id: 2, userId: 3, content: "Learning Express.js and building something cool today 🚀", createdAt: new Date(Date.now()-7200000).toISOString() }
    ],
    comments: [
      { id: 1, postId: 1, userId: 3, content: "Looks great!", createdAt: new Date(Date.now()-1800000).toISOString() }
    ],
    likes: [{ postId: 1, userId: 1 }],
    follows: [{ followerId: 1, followingId: 2 }]
  };
}
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : seedDB();
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function nextId(arr){ return arr.length ? Math.max(...arr.map(x=>Number(x.id)))+1 : 1; }
function currentUser(req){ return db.users.find(u=>u.id===req.session.userId); }
function publicUser(u){ return {id:u.id,name:u.name,username:u.username,bio:u.bio,avatar:u.avatar}; }
function requireAuth(req,res,next){ if(!currentUser(req)) return res.status(401).json({error:"Please login first."}); next(); }

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({secret:"social-demo-secret",resave:false,saveUninitialized:false,cookie:{maxAge:86400000}}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/",(_,res)=>res.sendFile(path.join(__dirname,"views","index.html")));
app.get("/profile.html",(_,res)=>res.sendFile(path.join(__dirname,"views","profile.html")));
app.get("/login.html",(_,res)=>res.sendFile(path.join(__dirname,"views","login.html")));
app.get("/register.html",(_,res)=>res.sendFile(path.join(__dirname,"views","register.html")));

app.get("/api/me",(req,res)=>res.json({user:currentUser(req)?publicUser(currentUser(req)):null}));

app.post("/api/register",(req,res)=>{
  const {name,username,email,password}=req.body;
  if(!name||!username||!email||!password||password.length<6) return res.status(400).json({error:"All fields are required and password must be 6+ characters."});
  const cleanUsername=username.toLowerCase().replace(/[^a-z0-9_]/g,"");
  if(db.users.some(u=>u.email===email.toLowerCase()||u.username===cleanUsername)) return res.status(409).json({error:"Email or username already exists."});
  const user={id:nextId(db.users),name:name.trim(),username:cleanUsername,email:email.toLowerCase(),password:bcrypt.hashSync(password,10),bio:"",avatar:`https://i.pravatar.cc/150?u=${cleanUsername}`,createdAt:new Date().toISOString()};
  db.users.push(user); save(); req.session.userId=user.id;
  res.json({user:publicUser(user)});
});

app.post("/api/login",(req,res)=>{
  const user=db.users.find(u=>u.email===(req.body.email||"").toLowerCase());
  if(!user||!bcrypt.compareSync(req.body.password||"",user.password)) return res.status(401).json({error:"Invalid email or password."});
  req.session.userId=user.id; res.json({user:publicUser(user)});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({message:"Logged out"})));

app.get("/api/users",(req,res)=>{
  const q=(req.query.q||"").toLowerCase().trim();
  const users=db.users.filter(u=>!q||u.name.toLowerCase().includes(q)||u.username.toLowerCase().includes(q)).map(publicUser);
  res.json(users);
});

app.get("/api/users/:username",(req,res)=>{
  const u=db.users.find(x=>x.username===req.params.username.toLowerCase());
  if(!u) return res.status(404).json({error:"User not found"});
  const followers=db.follows.filter(f=>f.followingId===u.id).length;
  const following=db.follows.filter(f=>f.followerId===u.id).length;
  const me=currentUser(req);
  const isFollowing=!!(me&&db.follows.some(f=>f.followerId===me.id&&f.followingId===u.id));
  res.json({...publicUser(u),followers,following,isFollowing});
});

app.put("/api/profile",requireAuth,(req,res)=>{
  const u=currentUser(req);
  u.name=(req.body.name||u.name).trim();
  u.bio=(req.body.bio||"").trim();
  u.avatar=(req.body.avatar||u.avatar).trim();
  save(); res.json({user:publicUser(u)});
});

app.get("/api/feed",requireAuth,(req,res)=>{
  const posts=[...db.posts].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(p=>{
    const u=db.users.find(x=>x.id===p.userId);
    const comments=db.comments.filter(c=>c.postId===p.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).map(c=>({...c,user:publicUser(db.users.find(x=>x.id===c.userId))}));
    return {...p,user:publicUser(u),likes:db.likes.filter(l=>l.postId===p.id).length,liked:db.likes.some(l=>l.postId===p.id&&l.userId===req.session.userId),comments};
  });
  res.json(posts);
});

app.post("/api/posts",requireAuth,(req,res)=>{
  const content=(req.body.content||"").trim();
  if(!content) return res.status(400).json({error:"Post cannot be empty."});
  const post={id:nextId(db.posts),userId:req.session.userId,content,createdAt:new Date().toISOString()};
  db.posts.push(post); save(); res.json(post);
});

app.delete("/api/posts/:id",requireAuth,(req,res)=>{
  const id=Number(req.params.id), p=db.posts.find(x=>x.id===id);
  if(!p) return res.status(404).json({error:"Post not found"});
  if(p.userId!==req.session.userId) return res.status(403).json({error:"You can delete only your own posts."});
  db.posts=db.posts.filter(x=>x.id!==id); db.comments=db.comments.filter(x=>x.postId!==id); db.likes=db.likes.filter(x=>x.postId!==id); save();
  res.json({message:"Deleted"});
});

app.post("/api/posts/:id/like",requireAuth,(req,res)=>{
  const postId=Number(req.params.id), index=db.likes.findIndex(l=>l.postId===postId&&l.userId===req.session.userId);
  if(index>=0) db.likes.splice(index,1); else db.likes.push({postId,userId:req.session.userId});
  save(); res.json({liked:index<0,likes:db.likes.filter(l=>l.postId===postId).length});
});

app.post("/api/posts/:id/comments",requireAuth,(req,res)=>{
  const content=(req.body.content||"").trim();
  if(!content) return res.status(400).json({error:"Comment cannot be empty."});
  const comment={id:nextId(db.comments),postId:Number(req.params.id),userId:req.session.userId,content,createdAt:new Date().toISOString()};
  db.comments.push(comment); save(); res.json(comment);
});

app.post("/api/users/:id/follow",requireAuth,(req,res)=>{
  const followingId=Number(req.params.id);
  if(followingId===req.session.userId) return res.status(400).json({error:"You cannot follow yourself."});
  const i=db.follows.findIndex(f=>f.followerId===req.session.userId&&f.followingId===followingId);
  if(i>=0) db.follows.splice(i,1); else db.follows.push({followerId:req.session.userId,followingId});
  save(); res.json({following:i<0});
});

app.listen(PORT,()=>console.log(`Social app running at http://localhost:${PORT}`));

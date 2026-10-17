const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, "database.json");

const seedProducts = [
  {id:1,name:"Wireless Headphones",description:"Comfortable wireless headphones with clear sound and long battery life.",price:4999,image:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",category:"Electronics",stock:15},
  {id:2,name:"Smart Watch",description:"Modern smartwatch for fitness tracking, notifications and everyday use.",price:6999,image:"https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",category:"Electronics",stock:12},
  {id:3,name:"Running Shoes",description:"Lightweight running shoes designed for comfort and daily training.",price:5499,image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",category:"Fashion",stock:20},
  {id:4,name:"Classic Backpack",description:"Durable everyday backpack for university, work and travel.",price:3299,image:"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",category:"Fashion",stock:18},
  {id:5,name:"Mechanical Keyboard",description:"Compact mechanical keyboard with tactile switches.",price:7999,image:"https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80",category:"Electronics",stock:10},
  {id:6,name:"Coffee Mug",description:"Minimal ceramic mug for coffee, tea and your desk setup.",price:1299,image:"https://images.unsplash.com/photo-1514228742587-6b1558fcf93a?auto=format&fit=crop&w=900&q=80",category:"Home",stock:30}
];

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const demoHash = bcrypt.hashSync("demo123", 10);
    const db = {
      users: [{id:1,name:"Demo User",email:"demo@example.com",password:demoHash}],
      products: seedProducts,
      orders: [],
      order_items: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
let db = loadDB();

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => Number(x.id))) + 1 : 1;
}

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret:"basic-ecommerce-demo-secret",
  resave:false,
  saveUninitialized:false,
  cookie:{maxAge:1000*60*60*24}
}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/",(_,res)=>res.sendFile(path.join(__dirname,"views","index.html")));
app.get("/product.html",(_,res)=>res.sendFile(path.join(__dirname,"views","product.html")));
app.get("/cart.html",(_,res)=>res.sendFile(path.join(__dirname,"views","cart.html")));
app.get("/login.html",(_,res)=>res.sendFile(path.join(__dirname,"views","login.html")));
app.get("/register.html",(_,res)=>res.sendFile(path.join(__dirname,"views","register.html")));
app.get("/orders.html",(_,res)=>res.sendFile(path.join(__dirname,"views","orders.html")));

app.get("/api/products",(req,res)=>{
  const q=(req.query.q||"").trim().toLowerCase();
  const products=q ? db.products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q)
  ) : db.products;
  res.json(products);
});

app.get("/api/products/:id",(req,res)=>{
  const product=db.products.find(p=>p.id===Number(req.params.id));
  if(!product) return res.status(404).json({error:"Product not found"});
  res.json(product);
});

app.post("/api/register",(req,res)=>{
  const {name,email,password}=req.body;
  if(!name||!email||!password||password.length<6)
    return res.status(400).json({error:"Name, email and a password of at least 6 characters are required."});
  const normalized=email.toLowerCase();
  if(db.users.some(u=>u.email===normalized))
    return res.status(409).json({error:"Email is already registered."});
  const user={id:nextId(db.users),name:name.trim(),email:normalized,password:bcrypt.hashSync(password,10)};
  db.users.push(user); saveDB();
  req.session.userId=user.id;
  res.json({message:"Registration successful",user:{name:user.name,email:user.email}});
});

app.post("/api/login",(req,res)=>{
  const {email,password}=req.body;
  const user=db.users.find(u=>u.email===(email||"").toLowerCase());
  if(!user||!bcrypt.compareSync(password||"",user.password))
    return res.status(401).json({error:"Invalid email or password."});
  req.session.userId=user.id;
  res.json({message:"Login successful",user:{name:user.name,email:user.email}});
});

app.post("/api/logout",(req,res)=>{
  req.session.destroy(()=>res.json({message:"Logged out"}));
});

app.get("/api/me",(req,res)=>{
  const user=db.users.find(u=>u.id===req.session.userId);
  res.json({user:user?{id:user.id,name:user.name,email:user.email}:null});
});

app.get("/api/orders",(req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:"Please login first."});
  const orders=db.orders.filter(o=>o.user_id===req.session.userId).map(order=>({
    ...order,
    items:db.order_items.filter(i=>i.order_id===order.id).map(i=>{
      const p=db.products.find(p=>p.id===i.product_id);
      return {quantity:i.quantity,price:i.price,name:p?.name||"Product"};
    })
  }));
  res.json(orders.reverse());
});

app.post("/api/orders",(req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:"Please login before checkout."});
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({error:"Cart is empty."});

  const clean=[];
  for(const item of items){
    const product=db.products.find(p=>p.id===Number(item.productId));
    const quantity=Math.max(1,Number(item.quantity||1));
    if(!product) return res.status(400).json({error:"A product in the cart no longer exists."});
    if(quantity>product.stock) return res.status(400).json({error:`${product.name} does not have enough stock.`});
    clean.push({product,quantity});
  }

  const total=clean.reduce((sum,x)=>sum+x.product.price*x.quantity,0);
  const orderId=nextId(db.orders);
  db.orders.push({id:orderId,user_id:req.session.userId,total,status:"Processing",created_at:new Date().toISOString()});

  for(const x of clean){
    db.order_items.push({id:nextId(db.order_items),order_id:orderId,product_id:x.product.id,quantity:x.quantity,price:x.product.price});
    x.product.stock-=x.quantity;
  }
  saveDB();
  res.json({message:"Order placed successfully",orderId});
});

app.listen(PORT,()=>console.log(`E-commerce website running at http://localhost:${PORT}`));

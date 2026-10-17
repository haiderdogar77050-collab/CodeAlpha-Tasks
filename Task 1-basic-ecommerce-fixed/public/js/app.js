const $ = (s) => document.querySelector(s);
const money = (n) => `Rs. ${Number(n).toLocaleString()}`;

function getCart() {
  return JSON.parse(localStorage.getItem("cart") || "[]");
}
function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
}
function addToCart(product, quantity = 1) {
  const cart = getCart();
  const found = cart.find(x => x.productId === product.id);
  if (found) found.quantity += quantity;
  else cart.push({ productId: product.id, quantity, product });
  saveCart(cart);
  alert(`${product.name} added to cart.`);
}
function updateCartCount() {
  const count = getCart().reduce((s, x) => s + x.quantity, 0);
  document.querySelectorAll(".cart-count").forEach(el => el.textContent = count);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

async function renderUser() {
  const box = $("#user-area");
  if (!box) return;
  const { user } = await api("/api/me");
  box.innerHTML = user
    ? `<span>Hi, ${user.name}</span> <a href="/orders.html">Orders</a> <a href="#" id="logout">Logout</a>`
    : `<a href="/login.html">Login</a> <a href="/register.html">Register</a>`;
  $("#logout")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await api("/api/logout", { method: "POST" });
    location.reload();
  });
}

async function renderProducts() {
  const grid = $("#products");
  if (!grid) return;
  const q = $("#search")?.value || "";
  const products = await api(`/api/products?q=${encodeURIComponent(q)}`);
  grid.innerHTML = products.map(p => `
    <article class="card">
      <img src="${p.image}" alt="${p.name}">
      <div class="card-body">
        <div class="muted">${p.category}</div>
        <h3>${p.name}</h3>
        <p class="muted">${p.description.slice(0, 80)}...</p>
        <div class="price">${money(p.price)}</div>
        <div class="actions">
          <a class="btn secondary" href="/product.html?id=${p.id}">Details</a>
          <button class="btn" data-add="${p.id}">Add to cart</button>
        </div>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-add]").forEach(btn => {
    btn.onclick = async () => {
      const product = products.find(p => p.id == btn.dataset.add);
      addToCart(product);
    };
  });
}

async function renderProduct() {
  const box = $("#product-detail");
  if (!box) return;
  const id = new URLSearchParams(location.search).get("id");
  try {
    const p = await api(`/api/products/${id}`);
    box.innerHTML = `
      <img src="${p.image}" alt="${p.name}">
      <div>
        <div class="muted">${p.category}</div>
        <h1>${p.name}</h1>
        <p>${p.description}</p>
        <div class="price">${money(p.price)}</div>
        <p class="muted">Stock: ${p.stock}</p>
        <label>Quantity</label>
        <input id="quantity" class="qty" type="number" min="1" max="${p.stock}" value="1">
        <br><br>
        <button class="btn" id="add">Add to cart</button>
      </div>`;
    $("#add").onclick = () => addToCart(p, Number($("#quantity").value));
  } catch (e) {
    box.innerHTML = `<div class="notice error">${e.message}</div>`;
  }
}

function renderCart() {
  const box = $("#cart-items");
  if (!box) return;
  const cart = getCart();
  if (!cart.length) {
    box.innerHTML = `<div class="empty"><h2>Your cart is empty</h2><a class="btn" href="/">Continue shopping</a></div>`;
    $("#cart-total").textContent = money(0);
    return;
  }

  let total = 0;
  box.innerHTML = cart.map((x, i) => {
    total += x.product.price * x.quantity;
    return `
      <div class="cart-row">
        <img src="${x.product.image}" alt="${x.product.name}">
        <div><strong>${x.product.name}</strong><div class="muted">${money(x.product.price)}</div></div>
        <input class="qty" data-qty="${i}" type="number" min="1" value="${x.quantity}">
        <strong class="line-price">${money(x.product.price * x.quantity)}</strong>
        <button class="btn danger" data-remove="${i}">Remove</button>
      </div>`;
  }).join("");

  $("#cart-total").textContent = money(total);

  box.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = () => {
      cart.splice(Number(btn.dataset.remove), 1);
      saveCart(cart);
      renderCart();
    };
  });

  box.querySelectorAll("[data-qty]").forEach(input => {
    input.onchange = () => {
      const i = Number(input.dataset.qty);
      cart[i].quantity = Math.max(1, Number(input.value));
      saveCart(cart);
      renderCart();
    };
  });
}

async function checkout() {
  const cart = getCart();
  if (!cart.length) return alert("Your cart is empty.");
  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: cart.map(x => ({ productId: x.productId, quantity: x.quantity }))
      })
    });
    localStorage.removeItem("cart");
    updateCartCount();
    alert(`Order #${result.orderId} placed successfully!`);
    location.href = "/orders.html";
  } catch (e) {
    if (e.message.toLowerCase().includes("login")) location.href = "/login.html";
    else alert(e.message);
  }
}

async function renderOrders() {
  const box = $("#orders");
  if (!box) return;
  try {
    const orders = await api("/api/orders");
    if (!orders.length) {
      box.innerHTML = `<div class="empty">You have no orders yet.</div>`;
      return;
    }
    box.innerHTML = orders.map(o => `
      <div class="order">
        <h3>Order #${o.id}</h3>
        <div class="muted">${new Date(o.created_at).toLocaleString()} · ${o.status}</div>
        <p>${o.items.map(i => `${i.name} × ${i.quantity}`).join("<br>")}</p>
        <strong>Total: ${money(o.total)}</strong>
      </div>
    `).join("");
  } catch (e) {
    box.innerHTML = `<div class="notice error">${e.message} <a href="/login.html">Login</a></div>`;
  }
}

function setupForms() {
  $("#register-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/register", { method: "POST", body: JSON.stringify(data) });
      location.href = "/";
    } catch (err) { $("#message").textContent = err.message; }
  });

  $("#login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify(data) });
      location.href = "/";
    } catch (err) { $("#message").textContent = err.message; }
  });

  $("#checkout")?.addEventListener("click", checkout);
  $("#search")?.addEventListener("input", renderProducts);
}

document.addEventListener("DOMContentLoaded", () => {
  updateCartCount();
  renderUser();
  renderProducts();
  renderProduct();
  renderCart();
  renderOrders();
  setupForms();
});

# Basic E-Commerce Website

A beginner-friendly full-stack e-commerce project built with:

- HTML
- CSS
- Vanilla JavaScript
- Node.js
- Express.js
- JSON file database (no native database build tools required)
- Session-based authentication

## Features

- Product listing
- Product details page
- Shopping cart
- User registration
- User login/logout
- Checkout/order processing
- JSON file database (no native database build tools required) for products, users and orders
- Responsive UI
- Demo products seeded automatically

## Run in VS Code

1. Open this folder in VS Code.
2. Open the terminal.
3. Run:

```bash
npm install
npm start
```

4. Open:

http://localhost:3000

## Demo account

Email: demo@example.com
Password: demo123

You can also create your own account.

## Database

The JSON file database (no native database build tools required) file `database.sqlite` is created automatically when the server starts.

Tables:

- users
- products
- orders
- order_items

## Project structure

```text
basic-ecommerce/
├── public/
│   ├── css/style.css
│   └── js/app.js
├── views/
│   ├── index.html
│   ├── product.html
│   ├── cart.html
│   ├── login.html
│   ├── register.html
│   └── orders.html
├── package.json
├── server.js
└── README.md
```

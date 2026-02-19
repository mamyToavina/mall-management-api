# Architecture

## Runtime

- Express app entry: `src/app.js`
- HTTP server bootstrap: `src/server.js`
- Main API router: `src/routes.js`
- MongoDB via Mongoose

## Modules

- `auth`: login, refresh, logout, boutique profile completion
- `admin`: tenant creation (boutique + contract + activation token/email)
- `users`: account creation and user moderation endpoints
- `boxes`: physical box inventory and occupancy details
- `products`: boutique product catalog, stock movement, promotion
- `billing`: contract remaining time and electricity invoice workflow
- `credit`: credit generation/printing/usage

## Security model

- JWT access token in `Authorization: Bearer <token>`
- Refresh token in `refreshToken` cookie
- Role middleware with values:
  - `ADMIN`
  - `BOUTIQUE`
  - `USER`

## Upload storage

- Product images: `uploads/products`
- User avatars: `uploads/users`
- Invoice PDFs: `uploads/invoices`

## Documentation flow

- Manual technical docs in `docs/`
- Auto-generated endpoint list from route files with:
  - `npm run docs:generate`
  - `npm run docs:watch`

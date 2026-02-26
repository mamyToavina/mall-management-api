# API Endpoints (Auto-Generated)

Generated at: `2026-02-26T18:59:34.822Z`

| Method | Path | Module | Source |
|---|---|---|---|
| `GET` | `/api/activities/` | `activities` | `src/modules/activities/activity.routes.js` |
| `POST` | `/api/activities/` | `activities` | `src/modules/activities/activity.routes.js` |
| `DELETE` | `/api/activities/:id` | `activities` | `src/modules/activities/activity.routes.js` |
| `GET` | `/api/activities/:id` | `activities` | `src/modules/activities/activity.routes.js` |
| `PATCH` | `/api/activities/:id` | `activities` | `src/modules/activities/activity.routes.js` |
| `PATCH` | `/api/activities/:id/photo` | `activities` | `src/modules/activities/activity.routes.js` |
| `GET` | `/api/activities/public/upcoming` | `activities` | `src/modules/activities/activity.routes.js` |
| `GET` | `/api/admin/contracts` | `admin` | `src/modules/admin/admin.routes.js` |
| `PATCH` | `/api/admin/contracts/:id/status` | `admin` | `src/modules/admin/admin.routes.js` |
| `POST` | `/api/admin/create-tenant` | `admin` | `src/modules/admin/admin.routes.js` |
| `GET` | `/api/admin/settings/general` | `admin` | `src/modules/admin/admin.routes.js` |
| `PUT` | `/api/admin/settings/general` | `admin` | `src/modules/admin/admin.routes.js` |
| `POST` | `/api/auth/complete-boutique-profile` | `auth` | `src/modules/auth/auth.routes.js` |
| `POST` | `/api/auth/login` | `auth` | `src/modules/auth/auth.routes.js` |
| `POST` | `/api/auth/logout` | `auth` | `src/modules/auth/auth.routes.js` |
| `POST` | `/api/auth/refresh` | `auth` | `src/modules/auth/auth.routes.js` |
| `GET` | `/api/billing/admin/boutiques-summary` | `billing` | `src/modules/billing/billing.route.js` |
| `POST` | `/api/billing/admin/electricity-invoices/upload` | `billing` | `src/modules/billing/billing.route.js` |
| `GET` | `/api/billing/admin/traces` | `billing` | `src/modules/billing/billing.route.js` |
| `GET` | `/api/billing/boutique/invoices` | `billing` | `src/modules/billing/billing.route.js` |
| `GET` | `/api/billing/boutique/invoices/:id` | `billing` | `src/modules/billing/billing.route.js` |
| `POST` | `/api/billing/boutique/pay/electricity` | `billing` | `src/modules/billing/billing.route.js` |
| `POST` | `/api/billing/boutique/pay/rent` | `billing` | `src/modules/billing/billing.route.js` |
| `GET` | `/api/billing/boutique/summary` | `billing` | `src/modules/billing/billing.route.js` |
| `GET` | `/api/billing/boutique/traces` | `billing` | `src/modules/billing/billing.route.js` |
| `POST` | `/api/boutiques/` | `boutique` | `src/modules/boutique/boutique.route.js` |
| `GET` | `/api/boutiques/public` | `boutique` | `src/modules/boutique/boutique.route.js` |
| `GET` | `/api/boutiques/public/:id` | `boutique` | `src/modules/boutique/boutique.route.js` |
| `GET` | `/api/boutiques/public/:id/products` | `boutique` | `src/modules/boutique/boutique.route.js` |
| `GET` | `/api/boxes/` | `boxes` | `src/modules/boxes/box.route.js` |
| `POST` | `/api/boxes/` | `boxes` | `src/modules/boxes/box.route.js` |
| `DELETE` | `/api/boxes/:id` | `boxes` | `src/modules/boxes/box.route.js` |
| `PUT` | `/api/boxes/:id` | `boxes` | `src/modules/boxes/box.route.js` |
| `GET` | `/api/boxes/:id/full-details` | `boxes` | `src/modules/boxes/box.route.js` |
| `GET` | `/api/boxes/statistics` | `boxes` | `src/modules/boxes/box.route.js` |
| `GET` | `/api/products/` | `products` | `src/modules/products/product.route.js` |
| `POST` | `/api/products/` | `products` | `src/modules/products/product.route.js` |
| `DELETE` | `/api/products/:id` | `products` | `src/modules/products/product.route.js` |
| `GET` | `/api/products/:id` | `products` | `src/modules/products/product.route.js` |
| `PATCH` | `/api/products/:id` | `products` | `src/modules/products/product.route.js` |
| `DELETE` | `/api/products/:id/images` | `products` | `src/modules/products/product.route.js` |
| `POST` | `/api/products/:id/images` | `products` | `src/modules/products/product.route.js` |
| `PATCH` | `/api/products/:id/images/replace` | `products` | `src/modules/products/product.route.js` |
| `DELETE` | `/api/products/:id/promotion` | `products` | `src/modules/products/product.route.js` |
| `PATCH` | `/api/products/:id/promotion` | `products` | `src/modules/products/product.route.js` |
| `PATCH` | `/api/products/:id/stock` | `products` | `src/modules/products/product.route.js` |
| `GET` | `/api/products/:id/stock-movements` | `products` | `src/modules/products/product.route.js` |
| `GET` | `/api/products/public/promotions` | `products` | `src/modules/products/product.route.js` |
| `GET` | `/api/reviews/boutiques/:boutiqueId` | `reviews` | `src/modules/reviews/review.routes.js` |
| `POST` | `/api/reviews/boutiques/:boutiqueId` | `reviews` | `src/modules/reviews/review.routes.js` |
| `GET` | `/api/reviews/me` | `reviews` | `src/modules/reviews/review.routes.js` |
| `GET` | `/api/reviews/users/:userId` | `reviews` | `src/modules/reviews/review.routes.js` |
| `GET` | `/api/sales/boutique/delivery-capacity` | `sales` | `src/modules/sales/sale.routes.js` |
| `GET` | `/api/sales/boutique/delivery-settings` | `sales` | `src/modules/sales/sale.routes.js` |
| `PATCH` | `/api/sales/boutique/delivery-settings` | `sales` | `src/modules/sales/sale.routes.js` |
| `GET` | `/api/sales/boutique/orders` | `sales` | `src/modules/sales/sale.routes.js` |
| `GET` | `/api/sales/boutique/orders/:id` | `sales` | `src/modules/sales/sale.routes.js` |
| `PATCH` | `/api/sales/boutique/orders/:id` | `sales` | `src/modules/sales/sale.routes.js` |
| `POST` | `/api/sales/checkout` | `sales` | `src/modules/sales/sale.routes.js` |
| `GET` | `/api/sales/my` | `sales` | `src/modules/sales/sale.routes.js` |
| `GET` | `/api/sales/my/:id` | `sales` | `src/modules/sales/sale.routes.js` |

> Do not edit this file manually. Run `npm run docs:generate`.

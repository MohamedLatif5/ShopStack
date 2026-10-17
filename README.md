# ShopStack

A small online store API with a product catalog, a shopping cart, and Cash-on-Delivery orders.

The focus is on backend correctness: server-side validation, authorization, transaction-safe inventory, and tests for the important flows — not on the number of features.

## Tech Stack

- NestJS + TypeScript
- PostgreSQL + Prisma (local PostgreSQL runs in Docker)
- Jest + Supertest

> The frontend (Next.js) is planned for a later stage.

## Getting Started

Requirements: Node.js 20 or newer, and Docker for the database.

```bash
npm install
npm run db:up      # start the local PostgreSQL container
npm run migrate    # apply database migrations
npm run start:dev
```

The API runs at `http://localhost:3000`, with Swagger UI at `http://localhost:3000/api`.
The database defaults live in `.env.example`; copy it to `.env` and adjust if your setup differs.

## API

Prices are integers in piasters: `1500` means 15.00 EGP (`1 EGP = 100`).

| Endpoint | Description |
| --- | --- |
| `GET /products` | List active products with pagination, sorting, and filters |
| `GET /products/:id` | Get the details of an active product |
| `GET /categories` | List active categories |

`GET /products` accepts optional query parameters:

| Parameter | Rules | Default |
| --- | --- | --- |
| `page` | integer ≥ 1 | `1` |
| `limit` | integer 1–100 | `10` |
| `sort` | `newest`, `price_asc`, `price_desc`, `name_asc`, `name_desc` | `newest` |
| `categoryId` | integer ≥ 1 | — |
| `search` | case-insensitive name match | — |
| `minPrice` / `maxPrice` | integer ≥ 0, in piasters (`minPrice ≤ maxPrice`) | — |

Example: `GET /products?categoryId=2&search=notebook&sort=price_asc&minPrice=100&maxPrice=5000`

Responses look like:

```json
{
  "items": [
    {
      "id": 1,
      "name": "Alpha Notebook",
      "description": null,
      "pricePiasters": 1500,
      "stock": 12,
      "category": { "id": 2, "name": "Books" },
      "createdAt": "2026-10-16T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Invalid query parameters get a `400 Bad Request`. A missing or inactive product id gets a `404 Not Found`.

## Authentication

Accounts register publicly (`POST /auth/register`) and log in with email and password (`POST /auth/login`). A successful login returns a JWT bearer token (HS256, 7-day expiry). Protected endpoints expect it in the `Authorization: Bearer <token>` header. Passwords are stored as bcrypt hashes only and are never returned by the API.

| Endpoint | Description |
| --- | --- |
| `POST /auth/register` | Create a customer account (email, password ≥ 8 chars, optional full name) |
| `POST /auth/login` | Exchange credentials for an access token |
| `GET /auth/me` | Return the authenticated user (requires Bearer token) |

Errors: `400` invalid payload, `409` duplicate email, `401` bad credentials or a missing/invalid token. Wrong-password and unknown-email logins return the same `401` message, so accounts cannot be probed through the API.

Admin accounts are customers whose `role` is set to `ADMIN` in the database; there is no public admin-promotion endpoint.

## Cart

Carts are server-side and exist only for authenticated customers (there are no guest carts). A cart stores product references and quantities — never prices. What the cart endpoints return is always the live product data, so a price change shows up immediately and the stored cart is never used as a source of truth at checkout.

| Endpoint | Description |
| --- | --- |
| `POST /cart/items` | Add a product (`productId`, `quantity`) |
| `GET /cart` | List the cart items in insertion order |
| `PATCH /cart/items/:id` | Change an item's quantity |
| `DELETE /cart/items/:id` | Remove an item |

Quantities must be positive integers and cannot exceed the product's current stock — at add time and at update time (`409` otherwise). Adding an inactive or missing product gets a `404`. A customer can only see and change their own items: another customer's item id behaves exactly like a missing one.

## Admin Catalog

Catalog management is admin-only: every `/admin/*` endpoint requires an admin Bearer token and answers `401` (no/invalid token) or `403` (non-admin account) otherwise.

| Endpoint | Description |
| --- | --- |
| `POST /admin/products` | Create a product |
| `PATCH /admin/products/:id` | Update provided fields (an empty patch is `400`) |
| `DELETE /admin/products/:id` | Delete a product |
| `GET /admin/categories` | List all categories, active and inactive |
| `POST /admin/categories` | Create a category |
| `PATCH /admin/categories/:id` | Update provided fields (rename, description, activate/deactivate) |
| `DELETE /admin/categories/:id` | Delete a category |

Errors: `400` invalid payload (unknown `categoryId`, empty patch), `404` missing product/category, `409` duplicate category name or deleting a category that still has linked products. Categories are protected by a database constraint: they can be deactivated while products reference them, but never deleted.

Product `stock` is intentionally absent from `PATCH /admin/products/:id`: all stock changes go through the inventory endpoints below, and every change is written to a stock-movement ledger.

## Admin Inventory

Stock changes are admin-only and traceable. Every adjustment is recorded as a movement (delta, reason, note, actor, time), and the ledger is the only way stock ever changes — including the initial stock recorded when a product is created.

| Endpoint | Description |
| --- | --- |
| `POST /admin/products/:id/stock` | Apply a relative stock change (`delta`, a non-zero integer) and record a movement |
| `GET /admin/products/:id/movements` | List a product's movements, newest first, paginated (`page`, `limit` up to 100) |

Adjustment payload: `delta` (required, non-zero integer), `reason` (`ADJUSTMENT` or `RESTOCK`; `SALE`/`CANCELLATION` are reserved for the future checkout flow), and an optional `note`. The stock check is atomic, so concurrent adjustments can never drive stock negative: a request that would goes through is `201` with the resulting `stockAfter`, one that would not is `409`.

Errors: `400` invalid payload, `404` missing product, `409` insufficient stock.

## Environment

`JWT_SECRET` signs the access tokens: generate one with `openssl rand -hex 32` and put it in `.env` (see `.env.example`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Run in watch mode |
| `npm run build` | Build for production |
| `npm run start:prod` | Run the production build |
| `npm run lint` | Lint the code |
| `npm run format` | Format with Prettier |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:db` | Database schema tests (recreates the test database) |
| `npm run test:cov` | Test coverage |
| `npm run db:up` | Start the PostgreSQL container |
| `npm run db:down` | Stop the PostgreSQL container |
| `npm run migrate` | Apply database migrations |

## Status

Work in progress. Features are added one at a time, each one tested before moving to the next. Currently implemented: the database foundation, the public product catalog (list, details, pagination, filters, Swagger), authentication (register, login, JWT guard, admin guard), admin catalog management (products and categories), the inventory ledger (atomic stock adjustments with a full movement history), and the shopping cart (add, view, update, remove).

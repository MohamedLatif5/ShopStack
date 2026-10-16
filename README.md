# ShopStack

A portfolio e-commerce backend: a small online store API with a product catalog, a shopping cart, and Cash-on-Delivery orders.

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

The API runs at `http://localhost:3000`.
The database defaults live in `.env.example`; copy it to `.env` and adjust if your setup differs.

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

Work in progress. Features are added one at a time, each one tested before moving to the next. Currently at the database foundation stage.

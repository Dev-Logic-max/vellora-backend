# Vellora Backend

Multi-tenant API for Vellora, built with **NestJS 11**, **TypeScript (strict)**, and
**Drizzle ORM** over PostgreSQL (Supabase-compatible). Standalone repo — pairs with
`vellora-frontend` (Next.js, `:3000`). Runs on **`:3030`**.

## Stack

- NestJS 11 (Express platform), feature-module structure
- Drizzle ORM + `postgres` (postgres.js) driver, `drizzle-kit` migrations
- `@nestjs/config` with validated env (`class-validator`)
- Supabase JWT auth (placeholder) + multi-tenant isolation (guard / interceptor / RLS plan)

## Getting started

```bash
pnpm install
cp .env.example .env   # then fill in DATABASE_URL + Supabase keys
pnpm start:dev         # http://localhost:3030  (health: /health)
```

> The app boots even without a reachable database — `postgres.js` connects lazily,
> and `/health` reports `database: down` instead of crashing.

## Scripts

| Script               | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `pnpm start:dev`     | Watch-mode dev server on `:3030`                 |
| `pnpm build`         | Compile to `dist/`                               |
| `pnpm start:prod`    | Run compiled server                              |
| `pnpm lint`          | ESLint (flat config, type-checked)               |
| `pnpm typecheck`     | `tsc --noEmit`                                    |
| `pnpm db:generate`   | Generate SQL migration from schema               |
| `pnpm db:migrate`    | Apply migrations                                 |
| `pnpm db:push`       | Push schema directly (dev)                       |
| `pnpm db:studio`     | Drizzle Studio                                    |

## Layout

```
src/
  config/        # env validation + typed configuration
  database/      # drizzle client, schema (companies, users), RLS policy plan
  common/        # tenancy: context (ALS), guard, interceptor, decorators
  auth/          # Supabase JWT validation (placeholder) + global guard
  companies/     # CRUD scaffold (tenant root)
  employees/     # CRUD scaffold (tenant-scoped, maps to `users`)
  health/        # public /health probe
```

## Multi-tenancy

1. `SupabaseAuthGuard` validates the bearer JWT and sets `req.user` (incl. `companyId`).
2. `TenantGuard` asserts a tenant is present on protected controllers.
3. `TenantInterceptor` opens an `AsyncLocalStorage` scope so services read the active
   `companyId` via `TenantContextService` without threading it through arguments.
4. **Postgres RLS** policies are drafted in `src/database/rls/policies.sql` (not yet
   applied) for defense-in-depth at the database layer.

## Auth (placeholder)

`AuthService` verifies HS256 Supabase access tokens when `SUPABASE_JWT_SECRET` is set,
otherwise decodes them without verification (local dev only). Tenant + role are read
from `company_id` / `role` claims. See the `TODO(Phase 1)` notes in `auth.service.ts`.

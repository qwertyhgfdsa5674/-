# Business Integration Test Confidence Design

## Goal
Raise production confidence by proving the critical business integration path works with realistic boundaries:

- platform clients build and parse marketplace API calls correctly
- database migrations create a usable schema and remain idempotent
- server read APIs return database-backed business data under authentication
- the web API client continues to send the same authentication contract
- CI has an explicit integration gate instead of relying on empty package test runs

This design intentionally starts with the business integration path. Playwright E2E and container smoke tests remain important, but they are second-phase work after the service and data contracts are trustworthy.

## Current State
- The repo is a pnpm monorepo on Node 22.
- Many package `test` scripts use `vitest run --passWithNoTests`, so `pnpm test` can pass while important packages have no coverage.
- `packages/server` already has API and worker tests, and the working tree contains additional uncommitted tests for API authentication and readiness.
- `packages/platforms/pdd` and `packages/platforms/alibaba1688` already have focused tests for signatures, token managers, and webhooks.
- `packages/core` has Drizzle schema and a custom migration runner, but no migration integration test against a real PostgreSQL database.
- The server can query dashboard, products, orders, sourcing, analytics, and diagnostics from PostgreSQL, falling back to mock data in non-production environments.

## Design Summary
Build a first-phase integration test suite around one question:

Can marketplace-shaped data and database-backed business state move through the platform, core, server, and web API contracts without drifting?

The first phase adds four test layers:

1. Platform client contract tests for PDD and Alibaba 1688.
2. Core migration integration tests against PostgreSQL.
3. Server database-backed API integration tests against seeded PostgreSQL.
4. CI integration job with PostgreSQL and Redis services.

## Test Layers

### 1. Platform Client Contract Tests
Add a shared contract test helper for platform clients that verifies:

- request method, URL, content type, and encoded body shape
- required auth and signature parameters are present
- sensitive values are not exposed in structured logs
- successful marketplace envelopes parse into local domain types
- marketplace error envelopes map to package-specific errors
- retry behavior only happens for retryable HTTP statuses

The first contract suite should cover:

- `packages/platforms/pdd`
- `packages/platforms/alibaba1688`

Douyin and Taobao can join this matrix after their clients grow beyond placeholders.

### 2. Core Migration Integration Tests
Add a migration integration suite that runs against a real PostgreSQL service.

The test should:

- apply all SQL migrations from `packages/core/src/db/migrations`
- verify `_migrations` records every applied SQL file exactly once
- re-run the migrator and verify idempotency
- verify core tables exist
- insert a minimal connected dataset across products, pricing, orders, trends, suppliers, inventory alerts, and related tables needed by server read APIs
- verify enum values and foreign keys reject invalid data where practical

The migrator currently exits the process when `DATABASE_URL` is missing or migration execution fails. The implementation plan should decide whether to extract a testable `runMigrations` function or exercise the existing CLI through a child process. The design preference is to extract a small reusable function while preserving the CLI behavior.

### 3. Server Database API Integration Tests
Add server integration tests that use the migrated PostgreSQL schema and a deterministic seed.

The suite should verify authenticated responses for:

- `GET /api/diagnostics/data-health`
- `GET /api/dashboard`
- `GET /api/products`
- `GET /api/orders`
- `GET /api/sourcing`
- `GET /api/analytics`

Expected behavior:

- requests include `Authorization: Bearer <API_KEY>`
- responses use `sourceType: "database"` rather than mock data
- dashboard metrics reflect seeded orders and pricing
- product, order, sourcing, and analytics payloads expose the seeded data through the public API shape
- production mode fails closed when the database is unavailable

Existing API hardening tests should remain fast unit-style tests using injected dependencies. The new database integration suite should be separate so developers can run it intentionally and CI can provision real services.

### 4. Web API Client Contract Regression
Keep the web API client tests focused on the HTTP contract:

- token from memory or local storage is sent as `Authorization: Bearer <token>`
- requests without a token omit the authorization header
- non-2xx responses throw `ApiRequestError` with status and response body

This is not a full frontend E2E replacement. It ensures the frontend-side API client keeps matching the protected server API contract while business integration coverage is being built.

## CI Integration Gate
Add a dedicated CI job named `integration`.

The job should:

- run after install and shared dependency build
- start PostgreSQL and Redis as GitHub Actions services
- set `DATABASE_URL`, `REDIS_URL`, `API_KEY`, and `NODE_ENV=test`
- run core migration integration tests
- run server database API integration tests
- run platform client contract tests

The existing lint, typecheck, unit test, and build jobs should remain. The new integration job should become a prerequisite for the build or deploy path once stable.

## Test Organization
Use predictable names so developers can run the right level of tests:

- `*.test.ts` for fast unit and contract tests that do not need external services
- `*.integration.test.ts` for PostgreSQL or Redis backed tests
- package scripts such as `test:integration` for service-backed suites
- a root `test:integration` script that filters the involved packages

Avoid removing `--passWithNoTests` across the entire monorepo in the first phase. Instead, make business-critical packages fail meaningfully through their explicit integration scripts. A later cleanup can remove empty-pass behavior package by package.

## Data Contract
Seed data should be small and deterministic:

- one active product with pricing
- one draft or archived product for status mapping
- at least two orders across supported platforms
- one unresolved inventory alert
- one trend keyword
- one supplier and supplier performance row where needed

Tests should assert public API behavior, not private SQL implementation details, except in the migration suite where schema existence and constraints are the subject under test.

## Error Handling
Integration tests should cover the failure modes that matter for production confidence:

- missing or invalid bearer token returns the expected auth failure
- database unavailable in production mode does not return mock data
- platform error envelopes become typed package errors
- retryable platform responses retry within the documented limit
- migration re-run does not duplicate `_migrations` rows

## Out of Scope For Phase 1
- Playwright browser E2E
- Docker Compose container smoke tests
- real calls to marketplace APIs
- exhaustive package-level unit coverage for every workspace package
- destructive migration compatibility analysis
- long-running load, rate-limit, or performance testing

## Success Criteria
Phase 1 is successful when:

- CI has a separate integration job that runs with real PostgreSQL and Redis
- core migrations are tested for apply and re-run idempotency
- server business read APIs are tested against seeded database state
- PDD and Alibaba 1688 clients have contract tests for request shape, parsing, error mapping, and retry behavior
- web API client authentication remains covered
- no integration test depends on live third-party marketplace credentials

## Implementation Notes
- Reuse existing Vitest tooling.
- Keep platform contracts mocked at the fetch boundary.
- Prefer extracting small testable helpers over shelling out where it reduces flakiness.
- Keep seeded data close to the server integration tests unless it becomes shared by more than one package.
- Do not modify unrelated package behavior just to increase coverage numbers.

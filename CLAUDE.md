# AI E-Commerce Automation

## Stack
TypeScript strict, Node 22, pnpm monorepo

## Principles
- API-first: prefer official APIs, RPA as fallback
- Idempotent: all write ops must be idempotent
- Observable: structured logging, health checks
- Secure: env vars for secrets, webhook signature verification
- Type-safe: Zod validation on all external data

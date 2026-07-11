# Deploy Migration Safety Design

## Goal
Make deploys fully automatic and safer by adding:
- pre-deploy and post-deploy migration steps
- database backup before any schema change
- automatic rollback on failure
- schema compatibility checks
- post-deploy smoke tests

This design fits the current single-host Docker Compose deployment model.

## Current State
- `packages/core/package.json` already exposes `db:migrate`.
- `.github/workflows/deploy.yml` currently builds images, uploads compose files, pulls images, and restarts services.
- The deployment path has no database backup, no migration gate, and no post-release smoke test.
- The server already exposes `/health/ready`, which is a good smoke-test anchor.

## Design Summary
Treat deploy as a release transaction:
1. Capture the current running release tag.
2. Create a database backup before migration.
3. Run schema compatibility checks against the new release artifacts.
4. Run migrations with the new server image.
5. Restart services with the new release.
6. Run smoke tests.
7. If any step fails, automatically restore the previous release and database backup.

## Proposed Workflow

### 1. Pre-deploy snapshot
The deploy job should:
- read the current remote `IMAGE_TAG`
- save it as the rollback target
- create a timestamped PostgreSQL backup with `pg_dump`
- store backup metadata on the server next to the compose file

Backup format should be plain SQL or custom-format dump, with a retention policy applied after success.

### 2. Schema compatibility check
Before applying a migration, the workflow should run a compatibility gate against the new migration set.

Minimum checks:
- verify the migration files are present and ordered
- compare the new schema snapshot against the currently deployed schema
- fail the deploy if the change is destructive without an explicit compatibility marker

The exact implementation can stay lightweight at first, but the gate must block unsafe breaking changes before the database is touched.

### 3. Migration job
Run `pnpm --filter @ai-ecommerce/core db:migrate` in a one-off container based on the new server image or a migration-capable runtime image.

Requirements:
- uses the same `DATABASE_URL` as production
- runs before `server` and `web` are restarted
- exits non-zero on any migration error
- does not rerun already recorded migrations

### 4. Release switch
If migration succeeds:
- update remote compose state to the new image tag
- restart `server`, then `web`, then reload `nginx`
- wait for readiness before continuing

### 5. Smoke tests
After restart, run automated checks from the workflow:
- `GET /health/ready`
- `GET /health/live`
- a protected API request with `API_KEY`
- one read-only business endpoint, such as `/api/dashboard` or `/api/products`
- optional web health probe for the frontend container

Smoke tests should fail the deploy if any endpoint returns a non-2xx status or a payload that indicates degraded readiness.

### 6. Automatic rollback
On any failure after the backup step:
- stop or replace the new release containers
- restore the database from the backup
- reset the remote `IMAGE_TAG` to the captured previous tag
- restart the prior release
- re-run smoke tests against the restored state

Rollback should be idempotent enough to handle partial failures, especially if the new release started but the smoke test failed.

## Rollback Rules
Rollback is automatic for:
- migration failure
- readiness failure after restart
- smoke test failure
- obvious compatibility gate failure after deployment prep

Rollback should prefer restoring the prior image and DB backup over trying to reverse individual schema changes manually.

## Backup Retention
Keep recent backups on the server and prune old ones after successful deploys.

Suggested policy:
- keep the most recent 7 daily backups
- keep the most recent successful backup for the current release line
- remove older backups only after the new release passes smoke tests

## Implementation Notes
- Use the existing deploy workflow instead of introducing a separate release system.
- Keep deployment logic in a small number of shell blocks or helper scripts so failure handling is explicit.
- Keep secrets and remote state in the existing GitHub Actions secret/variable model.
- Do not require a separate migration service unless later scaling forces it.

## Testing Strategy
Verify the change with:
- workflow-level dry-run reasoning on the step order
- unit or integration coverage for readiness and health endpoints if behavior changes
- one deploy-path smoke sequence in staging before production use

## Out of Scope
- multi-host orchestration
- zero-downtime blue/green infrastructure
- online schema rewrites for every destructive change
- long-term backup automation outside the deploy flow

## V1 Decisions
- Use a curated compatibility allowlist first. Strict SQL diffing can be added later, but v1 should fail fast on obvious destructive SQL unless the migration carries an explicit compatibility marker.
- Keep backups on the remote host for v1. This keeps rollback fast and avoids moving production dumps through GitHub Actions logs or artifacts.
- Run smoke tests through nginx as well as directly against server readiness. The deploy is not healthy unless the external entrypoint, frontend health endpoint, and authenticated API all work.

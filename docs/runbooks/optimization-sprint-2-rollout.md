# Optimization Sprint 2 Rollout Runbook

## Release Owner

- Assigned owner: `@unassigned` (must be replaced before production rollout)

## Migration Order

1. Apply DB migrations in sequence (`db/*.sql`), including `034_function_search_path_hardening.sql`.
2. Verify schema parity checks (`scripts/check-db-schema.mjs`, migration verification scripts).
3. Deploy API/server changes for lock guards and route contracts.
4. Deploy editor client/controller refactors and tests.

## Verification Order

1. DB lint/security checks (targeted mutable-search-path set remains closed).
2. Targeted unit tests for lock/security routes and mutators.
3. Canvas utility/controller tests (resize handles, coords, stage lifecycle).
4. Manual smoke in editor: select/crop/restore/upload/delete under locked and unlocked states.

## Rollback Per Batch

- **A1**: rollback by reapplying previous known-good migration snapshot (no partial function edits).
- **B + D-min**: revert lock-guard commits and redeploy API; keep DB schema intact.
- **A2**: documentation-only unless explicit privilege change approved.
- **C + D-full**: revert stage/controller refactor commits if interaction parity regresses.
- **E**: documentation and telemetry conventions can be rolled back independently.

## Telemetry Convention

For lock-blocked mutations, emit structured server logs with:

- `stage`
- `reason`
- `project_id`
- `image_id`

Counter/aggregation integration is optional for first pass.

## Post-Deploy Verification Checklist

- [ ] `image-state` mutation returns `409` on locked active image.
- [ ] crop mutation returns `409` on locked source image.
- [ ] restore mutation returns `409` on locked active image.
- [ ] delete mutation returns `409` on locked image.
- [ ] upload activation path returns `409` when lock blocks active-switch.
- [ ] lock route keeps `403 project_access` and `404 resource_missing` semantics.
- [ ] select/crop behavior parity unchanged in unlocked mode.

## Dry-Run Record

- Date: `2026-02-05`
- Environment: `local/dev`
- Operator: `cursor-agent`
- Result: `pass` (pending command evidence in CI)
- Release owner recorded: `@unassigned`

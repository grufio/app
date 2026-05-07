# Rollback Runbook

Production is broken. This is the reference card for the three rollback
paths in the stack: **app** (Vercel), **database** (Supabase), **filter
service** (Cloud Run). Pick the scenario, follow the steps, leave a
note in the incident channel after you're done.

## Decision tree

| Symptom | Likely surface | Section |
|---|---|---|
| App throws on every page, build dashboard is red | Vercel deploy | [App](#app-vercel) |
| Specific feature broken, errors mention SQL / RPC names | Supabase migration | [Database](#database-supabase) |
| `Failed to apply filter` / `service_unavailable` toast for every filter | Cloud Run filter service | [Filter service](#filter-service-cloud-run) |
| Login / signup flows fail with `Missing required environment variable` | Vercel env vars | [Env vars](#env-vars) |

When in doubt, roll back the most recent change first — fastest
mitigation, even if the root cause turns out to be elsewhere.

---

## App (Vercel)

Every git push to `main` produces a new Vercel deployment. Bad deploy
→ promote a known-good deployment as production.

1. Open https://vercel.com/grufios-projects/gruf.app/deployments
2. Filter to "Production" deployments. The most recent green one is the
   target.
3. Click "…" → **"Promote to Production"** on that deployment.
4. Vercel switches `gruf.app` to that deployment in <30 s. No DNS or
   git work needed.
5. Document the bad deploy hash in the incident channel and open a
   `revert/<hash>` branch with the original change reverted via
   `git revert <hash>` so the fix can roll forward through normal CI.

CLI alternative (when the dashboard is unreachable):
```
vercel promote <previous-deployment-id> --scope grufios-projects
```

## Database (Supabase)

Migrations land via `npm run db:push`. There is **no automated
rollback** for the schema — Postgres migrations are forward-only. To
revert:

1. **Stop the bleed**: if the migration was just merged but not yet
   pushed (`db/schema.sql` updated but `db:push` not run), revert the
   migration commit on `main` and skip step 2.
2. **Already pushed**: write a *forward* migration that undoes the
   change. Do NOT run `supabase db reset` on production.
   - For an RPC: `create or replace function ...` to the previous body.
   - For a column add: a follow-up migration that drops it.
   - For a column drop: usually unrecoverable without backup; restore
     from the daily snapshot via Supabase dashboard.
3. Mirror the rescue migration into `db/schema.sql` as a new block.
4. `npm run db:push` applies it.
5. Verify via `npm run verify:remote-rls` and
   `npm run verify:remote-migrations`.

Two patterns we already had to use this for (each landed as a
"cleanup" migration in `supabase/migrations/`):

- `20260504120000_cleanup_orphaned_filter_chains.sql`
- `20260505100000_cleanup_filter_chains_to_canonical_base.sql`

Treat both as templates: read-then-fix, idempotent, advisory-locked
where ordering matters.

## Filter service (Cloud Run)

Every push to `main` that touches `filter-service/` redeploys via
`.github/workflows/deploy-filter-service.yml`. To roll back:

1. List recent revisions:
   ```
   gcloud run revisions list \
     --service gruf-filter-service \
     --region europe-west3 \
     --limit 5
   ```
2. Send 100 % traffic to the previous green revision:
   ```
   gcloud run services update-traffic gruf-filter-service \
     --region europe-west3 \
     --to-revisions <prev-revision-name>=100
   ```
3. Verify:
   ```
   curl -sf https://<filter-service-url>/health
   ```
4. Open a `revert/filter-service-<hash>` branch with the bad change
   reverted, push, let the workflow forward-roll.

## Env vars

`Missing required environment variable: NEXT_PUBLIC_…` on production
means a Vercel env var is missing, mismatched, or the build wasn't
re-run since adding it (NEXT_PUBLIC_* are inlined at build time).

1. Vercel Dashboard → Project Settings → Environment Variables.
2. Compare against `.env.vercel.production.example` — every variable
   that file lists must be present in **Production** scope.
3. After adding/correcting, click "Redeploy" on the most recent
   production deployment so the new build embeds the new value.
4. For server-only secrets (e.g. `SUPABASE_SERVICE_ROLE_KEY`,
   `FILTER_SERVICE_TOKEN`) the env change is picked up on the next
   serverless function cold-start; no redeploy strictly needed but
   redeploy anyway to make the state observable.

---

## Aftercare

Whatever the path, when prod is green again:

1. Post in the incident channel: time of first signal, time of green,
   what was rolled back, what the forward-fix branch is.
2. Open a postmortem doc as `docs/postmortems/<YYYY-MM-DD>-<title>.md`
   if downtime > 5 min or any user-visible data corruption. Format is
   loose — what happened, why the gate didn't catch it, what we
   change to make it impossible next time.

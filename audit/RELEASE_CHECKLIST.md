# Stabilization release checklist

Branch: `codex/production-stabilization`. Original review: `PROJECT_REVIEW.md`, commit `02ed926`.

The fixes are local. Passing local checks does not establish that the live site has been upgraded. Do not advertise the existing deployment as repaired until the coordinated rollout and staging checks below are complete.

## Release contents

- `supabase/migrations/20261023080621_secure_atomic_billing.sql` replaces client financial writes with authorized, idempotent database transactions. Invoice lines, stock, batches, payments, returns, loyalty, and edit history commit or roll back together.
- The frontend and all 11 edge functions must accompany this migration. Existing frontend versions use writes that the migration intentionally revokes.
- Subscription entitlements and quotas come from the active subscription, with an explicit platform POS override. Known legacy FREE/PRO/PREMIUM marketing arrays are converted to settings. PRO retains its published “all modules” promise. Unknown legacy plan arrays require operator review.
- Financial outbox requests retain their originating account and operation UUID. Old entries without an account are quarantined; users must review and re-enter those changes. Do not attribute them to the next account that signs in.
- Historical sale costs are backfilled as estimates and marked in reports. Returns lacking an unambiguous original line require review before restoration.
- npm and `package-lock.json` are the release installation path; stale Bun lockfiles were removed. Node 22 LTS is used in CI. The unused legacy Capacitor asset generator was removed; existing native assets remain in the repository. Native device builds are outside this website verification.

## Reproducible checks

```powershell
npm ci --no-audit
$env:BILLLOOK_TEST_POSTGRES='postgresql://postgres@127.0.0.1:15439/postgres'
npm run check
npm run audit:production
```

The database URL above is for the disposable local test container, never production. Tests create and drop isolated databases. Without `BILLLOOK_TEST_POSTGRES`, PGlite validates the schema and billing tests, while the real concurrent-connection test skips. A release requires the native PostgreSQL run.

`npm run check` runs lint, unit/PDF/offline tests, PostgreSQL transaction tests, strict Deno checks for every function, isolated edge-handler tests, desktop/mobile browser tests, and a type-checked production build. CI uses a PostgreSQL 16 service and Chromium. Browser tests intercept every Supabase request and block other external requests; they never send live charges, emails, or AI requests.

PDF QA artifacts are generated with `BILLLOOK_PDF_ARTIFACTS=1` into ignored `tests/.artifacts/`. Render and inspect the long invoice, receipt, and both delivery copies, and check all page bounds. `audit/reproduce.mjs` is historical faulty-behavior evidence, not a post-fix test suite.

## Dependency and maintenance limits

Production dependencies pass the separate npm security audit. The full development tree still reports the unpatched `braces <=3.0.3` nested-pattern exhaustion advisory through Tailwind 3, its file watchers, and the development tagger. Compile trusted repository files only. Migrating to Tailwind 4 is a separate visual compatibility change; do not force that major update or disguise the advisory with a version override. The selector parser security override is tested by the real CSS build.

Lint has zero errors, with existing hook-dependency and Fast Refresh warnings tracked as maintenance debt. The browser checks cover the permission-loading race and business-switch state reset; lint warnings are not treated as proof of financial or authorization correctness.

## Required before live rollout

1. Take a verified database backup and prepare a maintenance window. Export the current function versions and hosting build for recovery.
2. Run `read-only-checks.sql` and the additional preflight checks below against the intended project. Stop on duplicate memberships/payment IDs, cross-tenant references, invalid financial rows, or unexpected schema drift.
3. Investigate existing stock discrepancies. The original audit counted one batch total mismatch and five movement-history mismatches. Establish physical stock/batch quantities and their evidence. Correct through reviewed adjustments and preserve the historical ledger; do not silently replace stock totals or manufacture a history. The new migration does not guess these quantities.
4. Rehearse the migration on an isolated restore/staging project and regenerate types from that schema. The local fixture reconstructs public schema metadata; it does not reproduce every hosted Auth, gateway, storage, or email behavior.
5. Reconcile migration bookkeeping. Remote historical timestamps differ from local filenames. **Do not run an unreviewed `supabase db push --include-all`, reset production, or replay old migrations.** Apply only the new reviewed transaction file in the controlled rollout, then record its exact version `20261023080621` as applied using the supported migration repair workflow. Reconcile historical filenames separately before future automated pushes.
6. Confirm target environment configuration without exposing values: production Cashfree credentials, webhook HMAC secret, Supabase URL/service/anon keys, AI provider key, email provider key/from address, and the application URL. Use independent sandbox credentials for sandbox requests. Keep service keys out of client builds.
7. Update the Auth redirect allow-list to include `/auth/reset-password`. Configure the Cashfree webhook to the intended project and confirm its gateway JWT verification remains disabled while HMAC verification remains active. The public invoice function is intentionally public; all other functions authenticate their callers.
8. Deploy database, functions, and frontend together while writes are stopped. Retire old clients/outbox formats and refresh the PWA. The migration revokes unsafe raw financial writes, so reverting only the frontend is not a compatible rollback.
9. In staging, validate owner/staff/outsider accounts through the real gateway: tenant/module denials, suspension/reactivation, purchase/sale/partial payment/edit/return/refund/delete/restore, batch movements, concurrent last-stock checkout, offline replay after a lost response, and till closing. Reconcile stock and balances before/after each flow.
10. Validate real provider settlement and recovery-email delivery in staging. A production payment smoke test, if required, must be a separately authorized controlled charge. Mocked local provider tests do not certify external delivery or settlement.
11. Re-run consistency checks, confirm subscription expiry/limits, verify reports and PDFs against the same ledger, and monitor failures before reopening writes. Roll back with the prepared coordinated recovery plan if reconciliation fails.

Additional read-only preflight checks:

```sql
SELECT user_id,business_id,count(*) FROM public.user_roles
GROUP BY user_id,business_id HAVING count(*)>1;
SELECT cf_payment_id,count(*) FROM public.subscription_orders
WHERE cf_payment_id IS NOT NULL AND cf_payment_id<>''
GROUP BY cf_payment_id HAVING count(*)>1;
SELECT count(*) AS invalid_line_quantities FROM public.invoice_items
WHERE quantity<=0 OR quantity::text IN ('NaN','Infinity','-Infinity');
SELECT count(*) AS invalid_payments FROM public.payments
WHERE amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity');
```

Do not merge or publish a “production ready” claim while rollout, stock reconciliation, or external staging verification remains unfinished.

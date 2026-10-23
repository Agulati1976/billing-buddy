# Release rehearsal — 2026-10-23

The full release migration, edge functions and frontend are **not permanently
deployed**. The only committed hosted-data change in this session is the reviewed
test-stock reconciliation described below.

## Checks completed

| Layer | Result |
| --- | --- |
| Clean npm installation and complete dependency audit | Passed; zero vulnerabilities |
| ESLint | Zero errors and zero warnings |
| Unit/PDF/offline | 26 passed |
| Native PostgreSQL 17 transactions/concurrency | 28 passed, none skipped |
| Edge function strict type checks / handler tests | 11 functions / 15 tests passed |
| Production-build browser checks | 14 passed; 27 owner and 13 admin routes |
| Real GoTrue/PostgREST/frontend integration and cleanup | 15 checks passed |
| Migration and transaction smoke on actual hosted database | 11 checks passed; ROLLBACK |
| Live batch / stock-history discrepancies after reconciliation | 0 / 0 |

Machine-readable evidence is in `evidence/staging-results.json`,
`evidence/hosted-transaction-results.json`, `evidence/backup-verification.json`
and `evidence/stock-reconciliation-results.json`. Private database dumps, Auth
data, original item records and execution receipts are ignored under
`audit/private/`. Do not upload that directory.

## Real-service rehearsal

The current public, Auth and Storage schema and database data were backed up with
the linked Supabase CLI. The dump's circular invoice references required restoring
data with the dump's replica setting; a restore verified the backup rather than
merely checking that files existed. Auth migration bookkeeping was exported and
restored separately because the normal dump excludes its contents.

The restore used `public.ecr.aws/supabase/postgres:17.6.1.104`, matching the hosted
engine. The new release migration applied successfully to the restored data.
Real `gotrue:v2.197.0` and `postgrest:v14.5` services ran on loopback ports 15442
and 15443 with a local-only JWT secret. The opt-in
`scripts/staging-smoke.mjs` deliberately fixes every service/database target to
loopback and never accepts a production endpoint.

The rehearsal created synthetic owner, staff and outsider users through the real
Auth admin API, then signed in with passwords and used the issued JWTs through
PostgREST. It covered module/tenant denials, raw-write denial, atomic opening
batches, payment replay, partial settlement, versioned edits, return/refund caps,
delete/restore replay, simultaneous last-unit sales, suspension, till cash and
stock reconciliation. The built frontend completed a rapid double-click checkout
against those services, with all Supabase network traffic redirected to the
local services. Its recovery form consumed a real generated recovery token and
updated the actual Auth password. Link generation did **not** send an email.
All temporary business data and Auth users were removed after each attempt.

The real API test exposed a release bug missed by SQL-only tests: explicitly
raising SQLSTATE `40001` on a stale edit caused PostgREST 14 to retry the request.
The invoice, item and batch conflict paths now use `PT409` and promptly return
HTTP 409. Both native and real API regressions cover this behavior. See the
[upstream retry issue](https://github.com/PostgREST/postgrest/issues/3673).

The same new migration was also run through the linked CLI on the actual hosted
database inside a transaction, followed by `audit/transaction-smoke.sql` and
ROLLBACK. Eleven authorization, billing, stock, payment, return, till and conflict
checks passed. No migration/schema changes or synthetic users from that rehearsal
were retained on the hosted project.

## Test-stock reconciliation

The user confirmed all six affected items were test data. Existing batch
quantities were chosen as the authority. After successful restore and hosted
rollback rehearsals, reconciliation run
`fe0048b6-0214-40a2-a114-7702493ffc16` appended six explicit ledger correction
entries and corrected one doubled opening item total. Five item totals stayed
unchanged; all original movements and batches were preserved.

The transaction locked the inventory tables, checked the exact approved old
balances/counts, temporarily suppressed only stock-application/field-guard
triggers for the ledger-only repair, restored their enabled state, and verified
the resulting balances before committing. `audit/reconcile-stock.sql` is the
reviewable template; `audit/prepare-stock-reconciliation.mjs` only prepares SQL
and does not connect to a database. Re-running the applied plan fails its old
balance preconditions, preventing double correction. Future customer inventory
requires authoritative physical counts rather than this test-data assumption.

## Outstanding acceptance and rollout

Actual recovery-email delivery, Cashfree settlement and external webhook delivery
were not exercised. The normal edge suite verifies handlers with isolated
providers, which cannot certify those external systems. No real charges, customer
emails or billable AI requests were made.

billlook.com responds from regular Hostinger hosting and its SPA deep links
respond successfully. The Hostinger tools exposed in this session only cover
agency hosting; its inventory did not contain billlook.com. A coordinated rollout
requires the regular hosting deployment tools/access, a current frontend/function
backup, the new migration only, and the old-client/outbox transition. Do not deploy
the database migration alone, because the older frontend's raw writes will stop
working. Follow `RELEASE_CHECKLIST.md` and recheck the hosted app after rollout.

# Stabilization status — 23 October 2026

Branch: `codex/production-stabilization`. Original review: `PROJECT_REVIEW.md`, baseline commit `02ed926`. All entries below describe local implementation, not deployment. No production database, function or hosting changes have been made. Follow `RELEASE_CHECKLIST.md` before rollout.

## Finding closure map

| Finding | Implemented fix | Evidence |
|---|---|---|
| F01 | Tenant reference validation and tenant-checked financial transactions | PostgreSQL tenant boundary tests |
| F02 | Module-aware RLS, manager stock/delete operations, protected owner/access fields; old batch-credit RPC revoked | Staff/POS-only/raw write denial tests |
| F03 | Active business/licensed membership required; disabled access screen | Suspension database test and disabled membership browser test |
| F04 | Sandbox cannot activate live subscriptions; production checkout UI | Sandbox activation test |
| F05 | Locked activation, unique payment identity, paid state cannot regress | Duplicate and concurrent callback tests |
| F06 | OCR auth, membership, body/image bounds and quota | Anonymous, foreign-business, image and quota edge tests |
| F07 | SaaS email admin-only with resolved owner recipient | Admin denial edge test; checked delivery result |
| F08 | Scoped reminder party/business and active sales; truthful pending state | Cross-tenant reminder edge test |
| F09 | Escape tenant strings in admin print HTML | Injection unit test |
| F10 | Atomic stock reversal, stable lines, optimistic version check | Rollback/version/history database tests |
| F11 | Invoice/payment commit together; failed checkout retained; clear before print | Database rollback and browser failure/double-click tests |
| F12 | Atomic delete/restore/purge; no quantity clamping | Consumed-purchase deletion, restore and purge tests |
| F13 | Recalculate balances from payments and active linked credits | Return followed by payment database test |
| F14 | Unsaved batches stay local and commit once with purchase | Batch purchase database test |
| F15 | Account/business/path keyed editor state and scoped requests | Business switch and offline account-change tests |
| F16 | Batch adjustment selection and enabled entry buttons | Batch adjustment database/browser tests |
| F17 | Append-only reversals with preserved invoice identity/snapshot | Movement history and edit tests |
| F18 | Outbox stops at parent failure; later operations preserve FIFO | Offline parent and sale-before-till-close tests |
| F19 | Account-owned queues/cache keys; unowned legacy entries quarantined | Cross-account and enqueue-race tests |
| F20 | Positive, source-linked POS returns with capped refunds | Return/refund database/browser tests |
| F21 | Services never require inventory | Service database/browser tests |
| F22 | Supplier purchases/returns and outgoing payment totals | Shared transaction checks and supplier route coverage |
| F23 | Quick invoices included in revenue/outstanding/ledger | Financial summary unit test and report/ledger route coverage |
| F24 | Complete stable pagination; chunked line lookups; aggregate caps removed | 1,234-row and later-page failure tests |
| F25 | Inclusive GST and flat discounts normalized to net prices | Inclusive arithmetic tests |
| F26 | Atomic redemption, earning snapshots, return/delete reversals | Loyalty lifecycle database test |
| F27 | Reset selected invoice on party/direction change and cancel stale loads | Payment integration review and route smoke coverage |
| F28 | Cash receipts/refunds explicitly assigned to a till; atomic open/close | Till-only totals and duplicate-open tests |
| F29 | Recovery route, confirmation and checked Auth update | Recovery browser flow |
| F30 | Request real password recovery email with redirect | Strict edge checks; real delivery remains staging verification |
| F31 | Stable operation receipts recognize committed retries | Lost-response, outbox, purge and callback replay tests |
| F32 | Active subscription flags/quotas; known legacy plans converted; limits displayed | Expiry/downgrade/staff/item/plan database tests |
| F33 | Generated schema types and mandatory build typecheck; CI | App/Deno checks and production build |
| F34 | Indian business calendar dates | Before-05:30 IST test |
| F35 | Net taxable revenue/returns, cost snapshots, GST reconciliation | Financial summary and cost snapshot tests |
| F36 | Derived support sender, protected assignments, inactive staff denied | Support identity/access database tests |
| F37 | Mobile party edit/delete controls | Mobile browser flow |
| F38 | Scoped member/ticket contact RPCs | Contact database tests; team/support route coverage |
| F39 | Public PDF taxable fallback subtracts discounts | Shared arithmetic and PDF checks |
| F40 | Original-line and cumulative return/refund caps | Return quantity and selected-refund database tests |
| F41 | In-flight POS guard and stable operation identity | Rapid double-click browser test |
| F42 | Order business authorized before provider verification | Foreign order verification edge test |
| F43 | Batch deletion retains audit notes with nullable batch FK | Nonempty batch deletion/replay database test |

Additional fixes include atomic item/opening batch creation, versioned batch edits, pincode renumbering, private operation receipts, bounded support account requests, public invoice active-business filtering, AI aggregate pagination/deleted-record filtering, CSV formula escaping, and a permissions-loading redirect race.

## Verification scope

The maintained command is `npm run check`. It runs lint, unit/PDF/offline tests, PostgreSQL billing/concurrency tests, strict Deno checks for every function, real edge handlers with isolated mocks, and browser tests against the type-checked production build. Browser tests block live external writes. CI supplies PostgreSQL 17 and Chromium. The historical `audit/reproduce.mjs` asserts old faulty behavior and is not the post-fix suite.

A clean `npm ci --no-audit` and `npm run check` succeeded. The complete dependency tree now reports zero npm vulnerabilities. The Tailwind 4 migration and removal of the obsolete tagger cleared all six advisory packages. Lint has zero errors and zero warnings, enforced with `--max-warnings=0`. The large frontend chunk remains performance maintenance work.

Real-service staging also found and fixed a PostgREST retry loop: application edit conflicts now use `PT409`, not engine serialization-failure code `40001`. All three invoice/item/batch conflict endpoints return HTTP 409 in integration tests. The CI fixture now serializes cluster role bootstrap and closes connections on setup failure.

Long invoice, thermal receipt and both delivery copy PDFs were rendered and inspected. Final results and command outcomes are recorded in `verification-results.json` after the frozen-source check completes.

## Live release gates

- Stock reconciliation is complete for the six items confirmed by the user to be TEST DATA. Existing batches were the authority; six explicit ledger corrections and one item-total correction leave both mismatch counts at zero. Original history is preserved.
- Local/remote historical migration timestamps differ. Apply only the new reviewed migration under a coordinated rollout; never reset production or replay historical migrations blindly.
- Migration rehearsal passed on a full backup restore and the actual hosted database with rollback. Real Auth/REST, frontend checkout, recovery-token verification and password update passed on the restore. Actual recovery-email delivery, external provider settlement/webhook delivery and deployed edge acceptance remain release gates.
- Database, edge functions and frontend must deploy together because raw financial writes are revoked. Old outbox entries without account identities need manual review.
- Historical cost backfill is marked as an estimate. Ambiguous legacy return lines need review before restoration.

## Continuation checkpoint

The final local release check passed: 26 unit, 28 native PostgreSQL, 15 edge and 14 production-build browser tests. The 40 owner/admin routes and mobile/desktop light/dark checkout passed. Fifteen real-service integration/cleanup checks passed, including actual signed GoTrue sessions and PostgREST transactions. Eleven hosted transaction checks passed with the release migration rolled back. See `verification-results.json` and `STAGING_RESULTS.md`.

Use isolated PostgreSQL 17 container `billlook-release-pg17` at `postgresql://postgres@127.0.0.1:15440/postgres` for future native/concurrency checks. It is not production. The original PostgreSQL 16 test container is separate. Auth/REST/backup-restore containers used for the rehearsal are disposable and contain no persistent release deployment.

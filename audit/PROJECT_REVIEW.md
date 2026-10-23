# Bill Look project review

Reviewed 23 October 2026 (Asia/Kolkata). Source baseline: `main`, commit `02ed926`.
Backend: Billing / `qbxombgwzqqumubpaogo`.

## Assessment

The application is not ready to be described as bug free. The largest risks are tenant authorization, subscription payment processing, and browser-orchestrated invoice/stock updates. Passing the current build and seven tests does not cover these flows.

This report contains 43 actionable findings. P1 means fix before relying on the affected functionality in production; P2 means a material correctness or operational issue. Findings concern the reviewed source unless explicitly marked as confirmed through live metadata or HTTP. They are not claims that every exploit has occurred.

Thirteen findings have executable local reproductions in [reproduce.mjs](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/audit/reproduce.mjs). Run `node audit/reproduce.mjs` from the repository root. The harness extracts current source functions and supplies in-memory dependencies; its assertions confirm the current faulty behavior. It is audit evidence, not the final regression suite. Results are recorded in [reproduction-results.json](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/audit/reproduction-results.json).

## Read-only production observations

- 36 public tables have RLS enabled. RLS being enabled does not make the policies sufficient; F01, F02, F03 and F36 explain specific gaps.
- All 11 edge functions are active. The production OCR endpoint accepts an unauthenticated empty request and returns its application validation error, HTTP 400 `image_base64 required`.
- One batch-tracked item's `current_stock` differs from the sum of its batch quantities.
- Five products' `current_stock` differs from the signed sum of their stock movements.
- The checks found no existing payment-to-invoice or invoice-line-to-item tenant mismatch, and no existing multi-role membership duplicates. This does not remove the missing enforcement described below.
- Stock and payment trigger definitions and relevant policies/constraints were read directly from the live database. No production customer rows were changed, no emails were sent, and no payment or AI-credit-consuming request was made.

The discrepancy counts identify reconciliation work, not a proven causal history for those particular records. Export and investigate the affected records before correcting stock.

Evidence snapshots are in `audit/evidence/live-policies.json`, `live-functions.json` and `live-constraints.json`. They contain schema metadata rather than customer rows. The consistency SQL is saved in [read-only-checks.sql](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/audit/read-only-checks.sql), with observed counts in [live-observations.json](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/audit/live-observations.json).

## Findings

### F01 — P1 — Cross-tenant foreign references can mutate another business's money or stock

**Where:** [payment policies and relationships](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260421092509_a112c679-95da-419c-9f6f-a1079b13ae75.sql:128), [stock application](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260825180000_stock_movement_single_source_redesign.sql:15), [payment trigger](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260708073552_c03c0e01-fc15-490c-869c-9901f9ed43d0.sql:8).

Live policies validate membership of the new payment/stock movement's `business_id`, but single-column foreign keys do not require its invoice, party, item or batch to belong to that business. Invoice-line policies validate the invoice's business, without validating the referenced item's/batch's business. Security-definer triggers then update the referenced invoice/item/batch by ID. An authenticated member who knows another tenant's invoice UUID, for example from a shared invoice, can associate an own-business payment with it and affect that tenant's balance. Similar stock references bypass tenant isolation.

**Fix:** enforce tenant and item/batch consistency in database constraints/validated mutation functions, and recheck it inside privileged triggers. Add two-tenant denial tests. Do not rely on IDs being hard to guess. Confirmed from live policies, foreign keys and function definitions; no cross-tenant write attempted.

### F02 — P1 — Staff module restrictions and soft-delete restrictions are not enforced by the backend

**Where:** [route guard](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/components/AppLayout.tsx:57), [invoice update policy](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260421092509_a112c679-95da-419c-9f6f-a1079b13ae75.sql:68), [soft delete](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Invoices.tsx:212).

The UI reads `staff_module_access`, but live business-table RLS generally permits all members to read/insert/update. A staff member denied a module can still use its REST operations. Setting `invoices.deleted_at` is an UPDATE, so the owner/admin DELETE policy does not protect soft deletion. Several action buttons also omit permission checks.

**Fix:** enforce role/module/operation permissions in RLS or privileged business operations, including protected columns such as `deleted_at`, prices and invoice totals. Hide disallowed UI actions as a usability measure after server enforcement.

### F03 — P1 — Suspending or soft-deleting a business does not revoke access

**Where:** [admin actions](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/admin-actions/index.ts:58), [membership helper](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260421085941_ab040734-6c14-42e9-9eba-8fcb10e75099.sql:56), [business provider](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/hooks/useBusiness.tsx:55).

Admin actions set `status`/`deleted_at`, but the live membership helper checks only `user_roles`. The shopkeeper provider and application guard do not exclude suspended/deleted businesses. Their members can continue loading and changing business records.

**Fix:** enforce active business state in backend access decisions, and route affected users to an explicit suspended-account screen. Ensure reactivation works without destroying membership.

### F04 — P1 — Sandbox payments activate real subscription records

**Where:** [client-selected payment mode](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/cashfree-create-order/index.ts:61), [verification activation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/cashfree-verify-order/index.ts:95), [checkout toggle](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Billing.tsx:161).

Any business member can request `mode: test`. A successful sandbox response then activates/extends the same `business_subscriptions` record used for real subscriptions. The public checkout even exposes a test-mode toggle.

**Reproduced:** the actual verification handler, with an in-memory sandbox PAID response, updates the production-shaped subscription record to active. No external payment was created.

**Fix:** make environment selection server controlled, restrict test checkout, and isolate test subscriptions/orders from production entitlements and revenue.

### F05 — P1 — Webhook retries and verification races grant subscription time more than once

**Where:** [success webhook](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/cashfree-webhook/index.ts:58), [verification fallback](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/cashfree-verify-order/index.ts:95).

Every valid success webhook extends the subscription, even if the order was already PAID. The event table has no unique payment/event idempotency constraint. Verification and webhook updates also use separate read/update requests, so both can grant time. Conversely, marking an order PAID before entitlement updates succeed can cause later verification to skip an activation that never completed. Delayed failed/dropped events can overwrite a PAID order.

**Reproduced:** sending the same validly signed local fixture twice to the actual webhook handler grants 60 days for a 30-day plan.

**Fix:** atomically transition an order once and grant its entitlement once, using an immutable payment ID, row locking and monotonic payment states. Retry incomplete processing safely.

### F06 — P1 — The public OCR endpoint can spend AI credits without authentication

**Where:** [OCR handler](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/parse-purchase-invoice/index.ts:37).

The function accepts image data and calls the paid AI gateway without authenticating the caller or checking a business entitlement. Its deployed `verify_jwt` flag is false. A harmless unauthenticated empty request reached its application validation code in production, confirming that gateway authentication does not protect the route.

**Fix:** require a verified user, business permission and quota, and impose payload limits and rate limits before contacting the AI service. No AI request was made during this audit.

### F07 — P1 — Any signed-in user can send arbitrary SaaS emails

**Where:** [SaaS reminder function](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/send-saas-reminder/index.ts:18).

The function validates a session, but never checks platform-admin status. It accepts arbitrary `to`, `subject` and `body`, then sends using the application's Resend identity when a key is configured. Hiding the button inside the admin UI does not protect this endpoint.

**Fix:** require platform-admin authorization, resolve recipients server-side and add rate limits/audit records. Source-confirmed; delivery was deliberately not exercised.

### F08 — P1 — Payment reminders expose and write another tenant's billing information

**Where:** [reminder lookup](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/send-payment-reminder/index.ts:45).

After checking only that a user is signed in, the function uses a service-role client with caller-supplied business/party IDs. It never verifies membership or that the party belongs to the business. It returns recipient email, invoice count and overdue total and can insert a reminder into that business's history. Deleted invoices are also not excluded from its overdue query.

**Fix:** verify membership and permissions before service-role access, validate all related IDs and exclude deleted invoices. Source-confirmed; no reminder was created.

### F09 — P1 — Tenant-controlled text can execute JavaScript in the admin print window

**Where:** [SaaS invoice printing](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/admin/AdminCustomerInvoices.tsx:152).

Business names/emails, line descriptions and notes are interpolated directly into HTML passed to `document.write`. A shopkeeper can create a business name containing HTML/script. When an admin prints its SaaS invoice, that markup is parsed in a same-origin window, with potential access to the admin session/original window.

**Reproduced:** the actual print function produces HTML from a harmless script-marker business name; parsing that output in isolated jsdom executes the marker.

**Fix:** render text with DOM text nodes or escape every interpolated value; preferably use the existing PDF generator. Use an isolated/sandboxed print surface as defense in depth.

### F10 — P1 — Invoice edits can leave partially reversed stock and replaced line items

**Where:** [edit path](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:718).

Editing reverses old stock, deletes movements, deletes old lines, inserts new lines, credits batches and updates the header through separate requests. A failed header update leaves new lines/stock under the old totals. Many reversal/delete/RPC errors are ignored. The attempted fallback when line insertion fails does not restore the complete original transaction state.

**Fix:** move the entire edit to one database transaction with concurrency control and invariant checks. A user-visible error must leave the original invoice, stock, payments and audit history unchanged.

### F11 — P1 — Checkout can report success after a payment fails to save

**Where:** [editor payment insertion](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:1060), [POS persistence](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:354).

Both flows ignore the returned payment insertion error before reporting success. Cash actually received can disappear from the recorded payment history. POS also leaves the already-created invoice header behind if line insertion fails; retrying can produce a second invoice. A later PDF/printing error is caught as a checkout error even after the sale committed, encouraging another sale attempt.

**Fix:** commit invoice, lines and payments atomically, check every result, and treat receipt generation as a post-commit operation that can be retried without creating another sale.

### F12 — P1 — Delete/restore silently discards stock that cannot be reversed

**Where:** [stock reversal](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Invoices.tsx:160), [restore ordering](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Invoices.tsx:224).

`Math.max(0, stock + delta)` hides insufficient stock. Restoring a sale of 10 when only 5 are available activates the full invoice but subtracts only 5. Deleting a purchase whose stock has already been sold similarly clamps the reversal. Restore changes invoice/payment visibility before stock validation, and intermediate errors are ignored.

**Reproduced:** restoring the sale in memory stores stock 0 rather than rejecting the required deduction of 10 from 5.

**Fix:** validate the full reversal and execute it atomically; never clamp away an inventory liability. Define explicit behavior when a received purchase has already been consumed.

### F13 — P1 — Sale-return credits disappear when payments change, and edits do not adjust them

**Where:** [return netting](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:1015), [payment recalculation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260708073552_c03c0e01-fc15-490c-869c-9901f9ed43d0.sql:8).

A return manually reduces the source sale's `balance_amount`. The live payment trigger later recalculates that balance as original total minus payments, ignoring returns. Example: sale 1,000, return 200, then payment 100 gives a balance of 900 instead of 700. Editing an existing return also bypasses the new-return netting block and does not apply the changed return amount to the source balance.

**Fix:** derive receivables from payments and active linked returns in one backend accounting operation; apply return deltas on create/edit/delete/restore.

### F14 — P1 — Creating a batch inside an unsaved invoice adds stock immediately

**Where:** [new-batch dialog save](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:409).

The dialog inserts a real batch, whose trigger immediately increases stock, before the purchase invoice is saved. Closing the editor, removing the line, navigating away or failing invoice save does not undo that receipt. Changing the line quantity after creating the batch also breaks the received quantity because `freshBatchIdsRef` suppresses later purchase crediting for that batch.

**Fix:** keep pending batches in draft state and create them with the invoice transaction, with one authoritative received quantity.

### F15 — P1 — Switching businesses preserves a cart or invoice draft from the old business

**Where:** [business switch](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/hooks/useBusiness.tsx:95), [POS local state](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:61), [editor local state](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:48).

Switching updates `current` without remounting the page or clearing its local cart, lines, party, original snapshot and batch references. An old cart can then be submitted using the new business ID; editor queries and update operations frequently target only invoice ID. For a user who belongs to both businesses this can create mixed-tenant records or edit the wrong tenant's invoice. Delayed fetches also have no cancellation/identity guard.

**Fix:** scope page state to business ID, reset/remount on a confirmed switch, guard unsaved work, cancel stale responses and enforce backend relationship consistency as in F01.

### F16 — P1 — Stock adjustments on batch-tracked items change only the item total

**Where:** [adjustment submission](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/components/StockAdjustDialog.tsx:38), [movement trigger](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260825180000_stock_movement_single_source_redesign.sql:15).

The stock-adjust dialog is available for batch-tracked items but inserts an item-level movement without identifying or updating a batch. This changes `items.current_stock` while leaving batch quantities unchanged. Selling a batch can then fail despite its displayed availability, or total inventory and batch availability disagree.

**Fix:** require a specific batch for batch-tracked adjustments, change batch quantity atomically, and let its movement trigger update the item total. A live aggregate check already found one item/batch-total discrepancy; its exact cause still needs investigation.

### F17 — P1 — Editing batch invoices corrupts the movement-history balance

**Where:** [reverse then delete old movements](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:755), [history calculation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/components/StockHistoryDialog.tsx:75).

Reversing an old batch line produces a new positive/negative movement through the batch trigger. The edit then deletes the original line's movement but keeps that reversal movement. With opening stock 100 and an old sale of 20, changing the sale to 30 can leave history `100 + 20 - 30 = 90` while actual stock is 70. Non-batch soft-delete reversals directly update the item without any movement, causing another history discrepancy.

**Fix:** preserve an immutable movement ledger with explicit reversal entries, or atomically replace/recalculate all related movements. Five products currently fail a read-only history-vs-stock check; that count alone does not establish which path caused each case.

### F18 — P1 — Offline operations continue after their parent operation fails

**Where:** [outbox loop](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/lib/offlineSync.ts:58), [unqueued purchase-credit RPC](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:1007).

A non-network failure of an invoice does not stop its line/payment operations. They consume retries and can become permanently failed before their parent succeeds. Failed operations are subsequently skipped. Purchase batch credits and return netting use online calls outside the queue, so they are not durably replayed with an offline invoice.

**Reproduced:** the drainer executes dependent lines after their invoice fails in an in-memory fixture.

**Fix:** queue complete business transactions with dependency-aware acknowledgement, or a single idempotent server operation per invoice. Include every stock, payment, return and loyalty effect.

### F19 — P1 — Offline state is shared across sign-ins and is not cleared or account scoped

**Where:** [outbox schema](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/lib/offlineDb.ts:4), [sign-out](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/hooks/useAuth.tsx:35), [REST cache](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/vite.config.ts:58).

The outbox has no originating auth-user namespace, uses a fixed database name and drains under whichever session is current. Signing out clears neither it nor the cached Supabase responses. On a shared device, the next account retains access to local payloads/cache; replay can fail until operations are permanently marked failed, or run under another user's session when both are members of the same business. Cached authorization-sensitive responses also outlive role/account changes.

**Fix:** namespace and verify offline state by user and business, gate draining on the originating identity, and implement explicit secure sign-out/cache invalidation behavior without silently discarding unsynced work.

### F20 — P2 — POS return/refund checkout cannot complete

**Where:** [return loading](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:564), [checkout](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:296).

Return loads negative quantities into an ordinary sale cart. Calculation floors the net taxable total to zero; default tender becomes zero, and checkout rejects it with `Enter payment amount`. Manually entering positive tender still attempts sale lines with negative quantities, which stock triggers reject. No refund direction or linked `sale_return` transaction is created.

**Reproduced:** the real total calculation and checkout handler hit the payment rejection for a returned line.

**Fix:** use an explicit linked return/refund flow with positive return quantities and correct stock/payment direction.

### F21 — P2 — Service items cannot be sold through POS or the invoice editor stock guard

**Where:** [POS stock check](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:151), [editor stock guard](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:635).

Reference queries omit the item `type`; frontend stock checks compare service quantity against `current_stock` just like products. A service normally has zero stock and is rejected. The backend trigger correctly skips services, so frontend behavior contradicts the supported item type.

**Reproduced:** adding a zero-stock Consultation service to POS produces an out-of-stock error and no cart line.

**Fix:** retain item type and restrict stock validation to inventory products.

### F22 — P2 — Supplier detail displays incorrect payable and payment totals

**Where:** [detail statistics](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/CustomerDetail.tsx:115).

The page is routed for suppliers as well as customers, but statistics always filter `type === sale`. Supplier purchases, paid amounts, payable balances and overdue purchase bills are therefore ignored.

**Reproduced:** an unpaid purchase of 500 produces displayed payable 0.

**Fix:** choose invoice types, labels and directions from party type, and test supplier as well as customer detail.

### F23 — P2 — Quick invoices are omitted from revenue and the party ledger

**Where:** [dashboard queries](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Dashboard.tsx:90), [report totals](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Reports.tsx:114), [ledger invoice types](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/PartyLedger.tsx:88).

Dashboard sales and main revenue/profit totals use only `sale`; quick invoices are fetched separately but omitted from those totals. The ledger ignores `non_inventory` invoices while including their payments. A fully paid quick invoice therefore appears as a customer credit rather than a settled sale.

**Reproduced:** quick invoice 500 plus its incoming payment 500 gives ledger balance -500 instead of 0.

**Fix:** define shared financial classifications for sale, quick invoice, quotation and returns and use them consistently across all summaries and ledgers.

### F24 — P2 — Unpaginated list queries silently truncate data and financial totals

**Where:** [report fetches](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Reports.tsx:85), [invoice listing](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Invoices.tsx:112), [item listing](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Items.tsx:75), [ledger fetches](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/PartyLedger.tsx:157).

These pages fetch entire tables/ranges and calculate totals in the browser without paging. The same pattern appears in stock history, loyalty and several admin summaries. When a query exceeds the configured REST row cap, remaining data is omitted without an application error, causing incomplete searches, exports and balances. The live database is currently small; this is a growth-triggered defect rather than proof that today's lists exceed the cap.

**Fix:** paginate lists and exports, and calculate totals in scoped server-side aggregate queries. Test with data beyond the API cap.

### F25 — P2 — Tax-inclusive calculation reports tax as a discount

**Where:** [discount aggregation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/lib/invoice.ts:87).

`lineDiscount` subtracts net taxable amount from the entered gross price when prices include tax. The tax component is consequently reported as a discount, even when none was entered. Saved exclusive-price calculations and the inclusive preview can disagree about displayed discount.

**Reproduced:** price 118 including 18% tax and zero discount returns discount 18 instead of 0.

**Fix:** calculate discounts on a consistently defined gross/net basis and keep displayed subtotal, discount, taxable amount and tax reconcilable.

### F26 — P2 — Deleted or reduced sales retain loyalty points

**Where:** [loyalty grant](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:1029), [delete/restore](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Invoices.tsx:212), [balance aggregation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Loyalty.tsx:41).

Creating a sale records points, but deleting/restoring it does not reverse/reapply those points; loyalty sums all transactions without excluding deleted invoices. Editing a sale down also keeps the previous earned amount. Users can retain rewards for sales that no longer count as active revenue. Concurrent redemption relies on a previously fetched client balance without an atomic backend balance check.

**Fix:** maintain an immutable, transactionally updated loyalty ledger linked to invoice lifecycle and validate redemption against the locked current balance.

### F27 — P2 — Changing party or payment direction leaves the old invoice selected

**Where:** [invoice options effect](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Payments.tsx:89), [payment submit](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Payments.tsx:103).

Reloading options after a party/direction change does not clear `invoiceId`. Submit checks only that it is nonempty where required, not that it belongs to the current party and invoice type. An outgoing supplier payment can remain linked to the previous customer's sale; the payment trigger then reduces the wrong invoice balance.

**Reproduced:** submitting with the stale invoice creates a payment for supplier B linked to customer A's sale.

**Fix:** clear dependent selection immediately and validate party/type/direction/tenant relationships in the backend.

### F28 — P2 — POS closing cash includes other tills and unrelated receipts

**Where:** [close day](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:538).

Expected cash sums all incoming cash payments for the business since the current session opened. It does not restrict invoices to the current `pos_session_id` or cashier, and it does not account for cash outflows. Concurrent tills and manual cash receipts therefore inflate a cashier's expected till.

**Reproduced:** opening 100, own sales 50, other cashier 200 and unrelated receipts 300 produces expected 650 rather than 150.

**Fix:** compute a session cash ledger with explicit sale/refund/withdrawal/pay-in entries, and close it atomically.

### F29 — P2 — Password recovery has no password-update screen

**Where:** [recovery redirect and automatic navigation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Auth.tsx:31), [auth provider](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/hooks/useAuth.tsx:21).

Recovery emails redirect to `/auth`, but a recovery session is treated as an ordinary signed-in user and immediately navigated away. No `PASSWORD_RECOVERY` UI or `auth.updateUser({password})` path exists anywhere in the app. Users cannot finish changing a forgotten password through the provided flow.

**Fix:** add a dedicated recovery route/state and password-update form, and test the full emailed-link round trip.

### F30 — P2 — Admin password-reset action generates a link but never sends it

**Where:** [admin recovery action](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/admin-actions/index.ts:76), [success message](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/admin/AdminShopkeeperDetail.tsx:105).

The action calls admin `generateLink` and discards the returned link. It does not dispatch an email, yet the UI says `Password reset email sent`. Users expecting that mail receive nothing.

**Fix:** use a recovery email delivery flow or explicitly send the generated link through an authorized server-side mail operation, and report actual delivery state.

### F31 — P2 — Offline retry cannot recognize writes that already committed

**Where:** [enqueue after network error](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/lib/offlineMutate.ts:35), [raw insert replay](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/lib/offlineSync.ts:22).

A response can be lost after the server commits an insert. The wrapper then queues the same UUID, and replay issues another plain insert. A duplicate-key result is treated as failure, retried six times and left permanently failed, even though the original row exists. There is no transaction-level idempotency key or verification of the committed payload.

**Fix:** add server-side idempotency for business operations and acknowledge matching committed operations. Do not blindly suppress every unique violation or overwrite data with a generic upsert.

### F32 — P1 — Paid plan features/limits are disconnected from access enforcement

**Where:** [plan configuration](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/admin/AdminPlans.tsx:34), [subscription activation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/cashfree-verify-order/index.ts:102), [POS entitlement](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/hooks/usePosAccess.tsx:29), [business limit](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Onboarding.tsx:23).

Checkout updates `business_subscriptions`, while POS checks an independently managed `business_features.pos_enabled`. Other configured plan features/limits are not used to authorize the corresponding operations. Multi-business premium access is based on a writable localStorage flag. Buying a plan that includes POS does not automatically grant it; expiration does not consistently remove feature access, and configured resource limits can be bypassed.

**Fix:** derive entitlements from a single authoritative subscription model and enforce resource limits server-side, with explicit administrative overrides.

### F33 — P2 — Production builds pass while application TypeScript fails

**Where:** [build script](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/package.json:8), [generated database types](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/integrations/supabase/types.ts:1791), [RPC calls](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:803).

`npm run build` invokes Vite without type-checking. `npx tsc -p tsconfig.app.json --noEmit` fails at editor lines 803 and 1007 because `credit_batch_quantity` is absent from checked-in generated types. Live-generated types also contain missing batch prices, invoice return links and movement batch links. The documented promise that types refresh themselves is not true for this checkout.

**Fix:** regenerate types from the reviewed schema through the supported generation workflow and make type-checking a required release check. Do not hand-edit the generated file.

### F34 — P2 — Business dates are recorded as the previous day before 05:30 IST

**Where:** [invoice default date](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:58), [POS date](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:357), [payment date](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Payments.tsx:52).

`new Date().toISOString().slice(0,10)` uses UTC, while other date filters use local days. At 00:30 in India, it returns the previous calendar date. New sales/payments, invoice numbers and dashboard `today` queries can disagree with the user's date and range filters.

**Fix:** use one explicit business-timezone date helper and test around local midnight and year changes.

### F35 — P2 — GST and profit reports disagree with discounted sales and returns

**Where:** [P&L](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Reports.tsx:140), [GST aggregation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Reports.tsx:150).

GST taxable value sums `subtotal`, which is before discounts, and GST totals never offset sale returns. P&L also sums pre-discount subtotals and omits return adjustments. Its cost calculation treats all period purchases as costs of sold goods, so buying unsold stock can create a misleading reported loss. Dashboard profit uses gross invoice amounts, creating another inconsistent basis.

**Reproduced:** discounted sale taxable 900/tax 162 with a return taxable 100/tax 18 reports taxable 1,000 and tax 162 rather than net taxable 800/tax 144.

**Fix:** use a shared accounting basis from finalized invoice/return data, and separate cash movement, purchases, inventory valuation and cost of sales instead of labeling one as another.

### F36 — P1 — Support permissions do not enforce sender identity or active staff status

**Where:** [support policies](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260712163924_e5f7e13b-5b47-4f77-9bdd-f0ba1d511eba.sql:57), [message insert policy](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260712163924_e5f7e13b-5b47-4f77-9bdd-f0ba1d511eba.sql:99).

The message policy requires `sender_id = auth.uid()` but does not constrain `sender_role`; customers can submit messages labeled admin/staff. Assignee access checks only `assigned_to`, so deactivating a support staff account does not revoke its ticket reads/writes through the API. The customer's update policy is named `own open ticket` but permits updates to all their own tickets and all mutable fields, including assignment.

**Fix:** derive sender role on the server, require active authorized staff for assignee access and restrict fields/transitions a customer can change. Confirmed against live policies.

### F37 — P2 — Mobile customers/suppliers have no edit or delete actions

**Where:** [mobile party list](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Parties.tsx:109), [party detail](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/CustomerDetail.tsx:199).

The mobile list offers only navigation to detail. Edit/delete controls exist in the desktop table, and the detail page provides no equivalent actions. Phone users cannot correct or remove a party through the UI despite the project's explicit mobile-action parity requirement.

**Fix:** add permission-aware mobile actions and verify them at phone widths.

### F38 — P2 — Team owners and support agents cannot read names the UI expects

**Where:** [team profile lookup](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Team.tsx:65), [support profile lookup](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/SupportAgent.tsx:46), [profile policies](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260421085941_ab040734-6c14-42e9-9eba-8fcb10e75099.sql:130).

Live profile SELECT policies allow only the profile owner and platform admins. Business owners therefore receive no other members' names/emails for the team screen; support agents receive no assigned customers' profiles. These fail as empty results, so the UI substitutes blanks/Unknown/Customer rather than exposing the policy mismatch.

**Fix:** expose only the required membership/assigned-ticket contact fields through narrowly scoped policies or a dedicated server function.

### F39 — P2 — Public shared invoice PDFs use the pre-discount subtotal as taxable amount

**Where:** [public PDF totals](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/PublicInvoiceView.tsx:78).

The public viewer falls back to `invoice.subtotal` for taxable amount, but the actual invoice schema does not persist the alternative `taxable_total`/`taxable_amount` fields it first tries. A discounted invoice displays a larger taxable amount in the shared PDF than in the editor/proforma, despite keeping the same final total.

**Fix:** calculate taxable amount consistently from finalized persisted totals or persist an authoritative taxable total, then use it in every document renderer.

### F40 — P1 — Returns can exceed the original sale quantities

**Where:** [source sale loading](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:285), [save validation](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/InvoiceEditor.tsx:619), [batch return trigger](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260825180000_stock_movement_single_source_redesign.sql:170).

Loading a source sale copies its lines but does not calculate remaining returnable quantities. Neither the save path nor the live triggers validate cumulative returns against the sold quantity or original party/line linkage. A sale of 1 can be returned as 100 or returned repeatedly, inflating inventory and crediting balances.

**Fix:** preserve source-line IDs, lock and validate cumulative return quantities/value atomically, and reject over-returning even through direct API calls.

### F41 — P1 — POS checkout has no in-flight guard and can create duplicate sales

**Where:** [checkout function](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:296), [always-enabled completion button](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:961), [late cart clearing](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Pos.tsx:425).

The completion button remains enabled while asynchronous writes and PDF generation run. There is no checkout lock or stable idempotency key. A second click after the first header is stored but before the cart is cleared can choose the next invoice number and record the same cart again. A unique invoice-number constraint does not prevent that case.

**Fix:** disable completion while processing and assign a durable checkout-operation ID that the backend accepts only once, including across retries/reloads.

### F42 — P2 — Payment verification does not authorize the order's business

**Where:** [order lookup and verification](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/functions/cashfree-verify-order/index.ts:57).

The function verifies a session and then loads any supplied `cf_order_id` using service role. Unlike order creation, it never verifies membership of `order.business_id`. Any signed-in caller with a known order ID can inspect its amount/status and trigger processing for another business.

**Fix:** authorize the authenticated caller against the loaded order before returning data or triggering changes. Keep provider callbacks separate from user-initiated verification.

### F43 — P2 — Deleting a nonempty batch can fail its own audit foreign key

**Where:** [batch DELETE trigger](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260825180000_stock_movement_single_source_redesign.sql:103), [movement insertion](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/supabase/migrations/20260825180000_stock_movement_single_source_redesign.sql:137), [UI deletion](C:/Users/welcome/Documents/ChatGPT/Ajay-Billing/src/pages/Batches.tsx:144).

On DELETE, `sync_item_stock_from_batches` inserts a movement carrying `OLD.id` as `batch_id`. The live movement foreign key still requires that batch row to exist, but the row has just been deleted. Nonzero quantity reaches the insertion and violates the foreign key; zero quantity returns early. The UI promises that deleting the batch removes its stock, but this path can roll back with a constraint error.

**Fix:** design deletion/auditing so historical movements retain a valid optional reference or immutable batch snapshot; add a real database regression test for deleting a nonempty batch. Confirmed by source and live DDL, not by a production DELETE.

## Additional release and operational gaps

These are separate from the 43 findings above and should be addressed in the stabilization work:

- **Clean install is broken:** `npm ci` fails because `package-lock.json` is out of sync with `package.json`. Local verification required an install without modifying the tracked lockfile. `date-fns` 4 also conflicts with the peer range of the current `react-day-picker`. Resolve the dependency graph deliberately and commit one authoritative lockfile.
- **Migration history diverges:** local migration version IDs differ from the remote history, and the local August versions are not listed remotely under those IDs, although live schema/functions include their features. Do not blindly push/replay the entire local history; reconcile actual DDL and migration bookkeeping first. One existing migration includes a stock-movement DELETE, making blind replay particularly risky.
- **Lint fails:** the baseline has 529 findings: 472 errors and 57 warnings. Treat lint cleanup separately from financial/security fixes, and keep a ratchet so fixes do not add new issues.
- **Coverage is insufficient:** the seven existing tests consist of one example and six scanner tests. They do not test invoice persistence, stock, returns, tax/reporting, payments, RLS, subscriptions, recovery or offline replay.
- **Early renewal is disabled:** `Billing.tsx:233/264` disables subscribing to the current non-expired plan even though server logic supports extending validity. The UI also drops object-shaped feature definitions because it renders arrays only, while admin plans save feature objects.
- **Reminder history overstates delivery:** `AdminReminders.tsx:129` inserts `status: sent` before delivery and ignores a successful response containing `delivered: false`. WhatsApp/mailto opening is not confirmation of delivery.
- **Multiple membership roles are allowed:** the live unique key is `(user_id,business_id,role)`, while `usePermissions` assumes one row via `maybeSingle()` and fails open for module access when role lookup errors. `create-staff` can insert a staff row for an existing owner/admin because that is not a unique conflict. Normalize membership to one role and fail closed. The aggregate check found no current duplicate memberships.
- **POS QR on paid receipts:** the thermal receipt generator uses the original total for the UPI amount when balance is zero, still labeling it `Pay via UPI`. A customer can be prompted to pay a settled bill again. Suppress the payment QR for settled invoices or clearly distinguish an unbound merchant QR.
- **PDF length handling needs dedicated visual tests:** thermal receipt height is estimated from item count rather than actual wrapped lines, and A4 totals/footer placement does not reserve space after a long item table. Large carts and rich multi-line item descriptions need rendered-page checks before calling document output reliable.
- **Admin mutation errors can be hidden:** several `admin-actions` cases return `ok: true` without checking the Supabase update/upsert result. A failed mutation or missing target can still show a success toast.

## Validation performed and limits

Reviewed application routing, custom hooks/helpers/components, the shopkeeper/admin/support data paths, 11 local edge-function sources and the 55-migration schema history. Read live table policies, relevant constraints, function definitions, trigger registrations, project/function status and aggregate consistency checks. Standard shadcn primitives and generated platform assets were not exhaustively line-audited as original business code.

- Production Vite/PWA build: passed on the baseline, with a large bundle warning.
- Existing Vitest suite: 7 tests passed after the missing local test dependency was supplied.
- Application TypeScript: failed at the two missing RPC type references.
- ESLint: 472 errors / 57 warnings on the baseline.
- Local audit harness: 13 source-level bugs reproduced with isolated mocks and a harmless HTML marker.
- Production OCR authentication probe: unauthenticated empty request reached validation, HTTP 400, without calling AI.
- Live read-only consistency: 1 item/batch mismatch; 5 movement-history mismatches.

The CLI could list deployed functions and metadata, but downloading deployed function source failed with `InvalidFunctionDownloadResponseError`. Therefore full deployed-source equality was not established. The audit did not log in as a shopkeeper/staff/admin in a browser, perform destructive production tests, run native Android device tests, send reminders, create payment orders or exercise real checkout. Browser rendering/accessibility and provider-specific end-to-end behavior remain additional test work. The reproduction harness uses in-memory dependencies and is not a substitute for PostgreSQL transaction/concurrency tests.

## Suggested repair order and acceptance criteria

1. **Close access gaps:** F01–F09, F36, F42. Add two-tenant, restricted-staff and anonymous denial tests. Isolate sandbox entitlements. Ensure untrusted names render as plain text.
2. **Make financial operations atomic:** F05, F10–F18, F26, F40–F41. Introduce validated/idempotent server operations for invoice/return lifecycle and subscription processing. Test network failure at every boundary and simultaneous requests. Every operation must either commit all intended effects once or leave the previous state intact.
3. **Reconcile current inventory:** export the mismatch records; compare batches, movements, source invoices and receipts. Repair only after identifying the correct stock and preserving an audit trail. Re-run the consistency checks after approved corrections.
4. **Repair daily workflows and reports:** F20–F28, F29–F30, F32, F34–F35, F37–F39, F43. Use fixed accounting fixtures that reconcile across dashboard, ledgers, invoices, PDFs and reports, including quick invoices, returns, discounts and suppliers.
5. **Make releases reproducible:** reconcile migration history, regenerate types, repair lockfiles and require install/type-check/lint/build/business-flow tests in CI. Add authenticated mobile/desktop end-to-end tests and rendered long-document tests in a staging environment.

The audit adds only review artifacts under `audit/`. It does not implement these fixes or alter production data/schema.

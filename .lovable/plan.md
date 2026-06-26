# Cashfree Subscriptions — Bill Look SaaS Billing

## Goal
Let shopkeepers pick a Bill Look plan (Free / Pro / Premium) and pay via Cashfree Subscriptions (production). When Cashfree confirms payment via webhook, mark the business's plan active for the billing period. Admin can view/cancel any subscription.

## Secrets (production)
Will request via secret form:
- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `CASHFREE_WEBHOOK_SECRET` (for signature verification)

API base used: `https://api.cashfree.com/pg` (PG + Subscriptions).

## Database (single migration)

1. **`subscription_plans`** — admin-managed catalog
   - `id`, `code` (free/pro/premium), `name`, `price_inr` numeric, `interval` (monthly/yearly), `features` jsonb, `is_active`, timestamps.
   - Seeded with Free (₹0), Pro (₹499/mo), Premium (₹999/mo). Admin can edit later.

2. **`business_subscriptions`**
   - `id`, `business_id` (FK), `plan_id` (FK), `cf_subscription_id` text, `cf_plan_id` text, `status` (initialized / active / on_hold / cancelled / expired), `current_period_start`, `current_period_end`, `last_payment_at`, `next_charge_at`, `amount`, timestamps.
   - Unique active subscription per business.

3. **`subscription_payments`**
   - `id`, `business_id`, `subscription_id`, `cf_payment_id`, `cf_order_id`, `amount`, `status`, `raw` jsonb, `paid_at`.

4. **`subscription_webhook_events`** — raw audit log for idempotency
   - `id`, `event_id` unique, `event_type`, `payload` jsonb, `received_at`.

All tables: explicit GRANTs (authenticated for read of own business; service_role full); RLS policies scoped by `business_id` via `is_business_member`. Plans table readable by any authenticated user.

## Edge functions

1. **`cashfree-create-subscription`** (auth required)
   - Input: `plan_id`, `customer_name`, `customer_email`, `customer_phone`, `return_url`.
   - Creates a Cashfree Plan on the fly if not cached (idempotent by code), then creates a Subscription, returns `subscription_session_url` to redirect the user.
   - Persists `business_subscriptions` row with `status='initialized'`.

2. **`cashfree-webhook`** (public, signature verified)
   - Verifies `x-webhook-signature` HMAC-SHA256 against `CASHFREE_WEBHOOK_SECRET` + timestamp.
   - Stores raw event, ignores duplicates by `event_id`.
   - On `SUBSCRIPTION_PAYMENT_SUCCESS` → insert `subscription_payments`, set subscription `active`, update `business_features.plan` to the plan code, extend `current_period_end`.
   - On `SUBSCRIPTION_CANCELLED` / `SUBSCRIPTION_ON_HOLD` → update status, downgrade `business_features.plan` to `free` on cancel/expire.

3. **`cashfree-cancel-subscription`** (auth required)
   - Calls Cashfree cancel API, sets local status to `cancelled`.

## Frontend

1. **`src/pages/Billing.tsx`** (new) — sidebar entry "Subscription" under Settings group.
   - Shows current plan + next charge date.
   - Plan cards (Free / Pro / Premium) with "Upgrade" / "Cancel" buttons.
   - Upgrade calls `cashfree-create-subscription` and redirects to `subscription_session_url`.
   - After return, polls subscription status.

2. **`src/pages/admin/AdminSubscriptions.tsx`** (new) — admin can view all subscriptions, filter by status, force-cancel.

3. Register routes in `src/App.tsx`, add module key `billing` in `src/lib/modules.ts`, sidebar link in `AppSidebar.tsx` and mobile menu.

## Webhook URL to configure in Cashfree dashboard
After deploy, give the user:
`https://qbxombgwzqqumubpaogo.supabase.co/functions/v1/cashfree-webhook`

## Out of scope (for this iteration)
- POS / invoice payment links via Cashfree
- Refunds UI (can be triggered manually from Cashfree dashboard)
- Proration on plan change (cancel + recreate flow used instead)

---

After plan approval I'll:
1. Request the 3 secrets.
2. Run the migration.
3. Create the 3 edge functions + Billing page + admin page + sidebar entries.
4. Give you the webhook URL to paste into Cashfree dashboard.

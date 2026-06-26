## Cashfree Payment Gateway (Orders API) — SaaS Plan Billing

Since Cashfree Subscriptions isn't activated, we'll use **Cashfree PG Orders API**. Each plan renewal = a fresh "order" the shopkeeper pays. We auto-extend their plan validity on successful payment. For "recurring", we'll send reminders + one-click renew (no auto-debit, since that requires Subscriptions).

---

### 1. Database (migration)

**`subscription_plans`** — admin-configurable plans
- name, code (FREE / PRO / PREMIUM), price_inr, duration_days, features (jsonb), is_active, sort_order

**`business_subscriptions`** — current plan state per business
- business_id (unique), plan_id, status (active/expired/cancelled), started_at, expires_at, last_order_id

**`subscription_orders`** — every Cashfree order created
- business_id, plan_id, cf_order_id, cf_payment_id, order_amount, order_currency, status (CREATED/PAID/FAILED/DROPPED), payment_method, raw_response (jsonb)

**`cashfree_webhook_events`** — raw webhook audit log
- event_type, cf_order_id, signature_verified, payload (jsonb), processed

Seed 3 default plans (Free / Pro ₹499/mo / Premium ₹1499/mo).

---

### 2. Edge Functions

| Function | Purpose |
|---|---|
| `cashfree-create-order` | Creates Cashfree order, returns `payment_session_id` for frontend SDK |
| `cashfree-webhook` | Receives + verifies signature, updates order & extends `expires_at` |
| `cashfree-verify-order` | Manual fallback: poll order status by `cf_order_id` |

Uses secrets already set up: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`.

Webhook URL to register in Cashfree (PG → Developers → Webhooks):
```
https://qbxombgwzqqumubpaogo.supabase.co/functions/v1/cashfree-webhook
```
Events to subscribe (from your screenshot): **success payment**, **failed payment**, **user dropped payment**, **refund**.

---

### 3. Frontend

**`src/pages/Billing.tsx`** (shopkeeper)
- Current plan card with expiry date + days remaining
- Plan comparison grid (Free / Pro / Premium)
- "Upgrade" / "Renew" buttons → calls `cashfree-create-order` → opens Cashfree Checkout via SDK (`@cashfreepayments/cashfree-js`)
- Payment history table

**`src/pages/admin/AdminSubscriptions.tsx`**
- All businesses with plan, expiry, MRR
- Manually override plan, view all orders

**Sidebar entry**: "Billing & Plans" for shopkeepers.

**Renewal reminder**: small banner inside app when expiry ≤ 7 days.

---

### 4. Flow

```
Shopkeeper clicks "Upgrade to Pro"
    → edge fn creates Cashfree order, returns payment_session_id
    → frontend opens Cashfree Checkout
    → user pays
    → Cashfree fires webhook → we verify signature, mark order PAID,
      extend business_subscriptions.expires_at by plan.duration_days
    → frontend polls verify-order for instant UI update
```

---

### Technical notes
- Production endpoint: `https://api.cashfree.com/pg/orders`
- API version header: `x-api-version: 2023-08-01`
- Webhook signature: HMAC-SHA256 of `timestamp + rawBody`, base64, compared to `x-webhook-signature` header
- No auto-debit — shopkeepers manually renew (with reminders). Future upgrade path: switch to Cashfree Subscriptions once activated, without breaking existing data.

Approve and I'll start the migration + edge functions.
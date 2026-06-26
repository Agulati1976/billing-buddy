
# Proper SaaS Admin Panel Overhaul

Transform the admin panel so it behaves like a real SaaS control center — full plan management, customer billing, reminders, invoices, and SaaS-revenue-focused payments view.

## 1. Plans Management (full CRUD + features)

Rebuild `src/pages/admin/AdminPlans.tsx`:
- Table of all plans with: name, price, duration (days), max users, max invoices, max items, features list, active toggle.
- "New Plan" + "Edit Plan" dialog where admin can change:
  - Price (₹), billing cycle (days)
  - Plan name, description, tagline
  - Feature toggles (POS, multi-branch, barcode, batch tracking, online orders, quick invoices, party ledger, reports export, custom branding, priority support, etc.)
  - Limits (users, invoices/month, items, branches, storage)
- "Delete plan" with safety check (only if no active subscribers).
- All edits saved to `subscription_plans` table (already exists) — extend it with `features jsonb`, `limits jsonb`, `tagline`, `is_active`, `sort_order`.

## 2. SaaS Payments Tab (rename + repurpose)

Currently `AdminPayments.tsx` shows shopkeeper customer payments. Replace it:
- Rename in sidebar to **"SaaS Revenue"**.
- New `AdminSaasPayments.tsx` reads from `subscription_orders` + `business_subscriptions`.
- Shows: every payment shopkeepers made to OUR app (plan purchases/renewals).
- Columns: Date, Business name, Owner email, Plan, Amount, Cashfree order id, Status, Method.
- Filters: status (paid/failed/pending), date range, plan.
- KPIs: Today's revenue, MTD, YTD, MRR, ARR, Active paying customers, Churn this month.
- CSV export.

Keep the old shopkeeper-payment view (if useful) only inside per-business drill-down — not as a top-level admin tab.

## 3. Customer Invoices (admin issues invoices to shopkeepers)

New `src/pages/admin/AdminCustomerInvoices.tsx` + table `saas_invoices`:
- Admin can generate an invoice for any shopkeeper (auto-numbered `BL-INV-0001`).
- Fields: business, plan/line items, amount, GST %, due date, notes.
- Status: draft, sent, paid, overdue, cancelled.
- Auto-link to a `subscription_order` once paid (via Cashfree link or manual mark-paid).
- "Download PDF" + "Email to customer" actions.
- Used for manual deals, custom pricing, enterprise quotes.

## 4. Reminders to Customers

New `src/pages/admin/AdminReminders.tsx` + edge function `send-saas-reminder`:
- Admin picks a business (or bulk: "all expiring in 7 days", "all overdue").
- Choose channel: Email (Resend) and/or WhatsApp link.
- Template picker: Renewal due, Payment overdue, Trial ending, Custom message.
- Variables auto-filled: {business_name}, {plan}, {expiry_date}, {amount}, {pay_link}.
- Log every reminder in `saas_reminders` table (who, when, channel, template, status).
- "Auto-reminder rules": toggle to auto-send 7/3/1 days before expiry.

## 5. Users Tab Enhancements

Polish `AdminUsers.tsx`:
- Add per-row quick actions: change plan, extend validity (+7/+30/+90 days), send reminder, generate invoice, view ledger, ban/unban.
- Add bulk select + bulk actions.
- Show plan badge, expiry countdown, lifetime value, last login.

## 6. Overview Polish

`AdminOverview.tsx`:
- Add SaaS-specific KPIs: MRR, ARR, Active subscribers, Trial users, Churned this month, ARPU, LTV.
- Top plans by revenue chart.
- Recent SaaS payments + recent signups side by side.
- "Expiring this week" alert card with one-click reminder.

## 7. Sidebar Reorganisation

`src/pages/Admin.tsx` sidebar order:
1. Overview
2. Users / Businesses
3. Plans
4. SaaS Revenue (was Payments)
5. Customer Invoices (new)
6. Reminders (new)
7. Subscriptions
8. Audit Log

## Technical Details

**New tables (migration):**
- `saas_invoices` — admin-issued invoices to shopkeepers (business_id, invoice_no, line_items jsonb, subtotal, gst, total, status, due_date, paid_at, cashfree_order_id, notes).
- `saas_reminders` — reminder history (business_id, type, channel, template, subject, body, sent_at, sent_by, status, error).
- `saas_reminder_rules` — auto-reminder config (days_before, template_id, channel, enabled).

**Extend `subscription_plans`:**
- Add `features jsonb default '{}'`, `limits jsonb default '{}'`, `tagline text`, `sort_order int`, `is_active bool default true`.

**New edge functions:**
- `send-saas-reminder` — sends email via Resend / generates WhatsApp link, logs to `saas_reminders`.
- `saas-invoice-pdf` — renders invoice PDF (or returns HTML for client-side print).
- `saas-cron-reminders` — daily cron checks expiring subs and auto-sends per rules.

**Secrets needed:**
- `RESEND_API_KEY` (for sending reminder emails) — will request via add_secret.

**Frontend files touched/created:**
- New: `AdminPlans.tsx` (rewrite), `AdminSaasPayments.tsx`, `AdminCustomerInvoices.tsx`, `AdminReminders.tsx`, `AdminInvoiceDialog.tsx`, `ReminderDialog.tsx`, `PlanEditorDialog.tsx`.
- Update: `Admin.tsx` (routes + sidebar), `AdminOverview.tsx`, `AdminUsers.tsx`.

## Out of scope (ask if needed)
- Coupon/discount codes
- Refund processing from admin UI (currently must be done in Cashfree dashboard)
- Multi-currency

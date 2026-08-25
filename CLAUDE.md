# Bill Look — Project Context (for Claude)

> Read this file first before making any change. It describes the whole app: stack,
> domain, routes, database, edge functions, and the rules/gotchas that already bit us.

---

## 1. What the product is

**Bill Look** (domain `https://billlook.com`) is a multi-tenant **GST billing + inventory SaaS for Indian shopkeepers**.

Three distinct user surfaces:

| Surface | Who | Entry route |
|---|---|---|
| Shopkeeper app | Business owner / admin / staff | `/` (guarded by `AppLayout`) |
| Platform admin panel | Bill Look staff (`platform_admins`) | `/admin` (guarded by `AdminLayout`) |
| Support agent portal | Support staff (`support_staff`) | `/support-agent` |

Money is in **INR (₹)**. Dates/GST/HSN/state codes follow Indian conventions.

---

## 2. Stack

- **React 18 + Vite 5 + TypeScript 5**, Tailwind CSS v3, **shadcn/ui** (Radix) in `src/components/ui`
- **React Router v6** (all routes in `src/App.tsx`), **TanStack Query** provider is mounted but most pages fetch directly with the Supabase client + `useState/useEffect`
- **Supabase** (project ref `qbxombgwzqqumubpaogo`) — Postgres + RLS + Auth + Edge Functions (Deno)
- **Capacitor 8** for Android/iOS wrapper (`capacitor.config.ts`, `src/lib/native.ts`)
- **Cashfree** (`@cashfreepayments/cashfree-js`) for SaaS subscription payments
- Charts: **Recharts**. Toasts: **sonner** (`toast.success/error`) — prefer sonner over the legacy `use-toast`.
- Offline support: IndexedDB queue in `src/lib/offlineDb.ts`, `offlineMutate.ts`, `offlineSync.ts`

Client import is always:
```ts
import { supabase } from "@/integrations/supabase/client";
```

`src/integrations/supabase/types.ts` is **generated — never edit it**. Schema changes go through
a Supabase migration; the types file refreshes itself.

---

## 3. Directory map

```
src/
  App.tsx                 # every route
  components/
    AppLayout.tsx         # auth + business guard, sidebar + topbar shell
    AppSidebar.tsx        # desktop nav
    MobileBottomNav.tsx   # mobile nav (full categorised module list lives here)
    ItemDialog.tsx        # create/edit item (incl. initial batch, decimal-qty toggle)
    ItemPickerDialog.tsx  # multi-select item picker + barcode scan (used by invoice editor)
    PartyDialog.tsx, StockAdjustDialog.tsx, StockHistoryDialog.tsx
    BarcodeScanner.tsx, PurchaseInvoiceScanner.tsx (AI OCR of purchase bills)
    admin/                # KpiCard, RevenueChart, SignupsChart, StatusBadge, AdminTopbar
    support/              # TicketBadges, TicketDetail
    ui/                   # shadcn primitives — don't restyle globally
  hooks/
    useAuth.tsx           # session provider
    useBusiness.tsx       # current business + business list (multi-tenant switcher)
    usePermissions.tsx    # role within a business + staff module access
    usePlatformAdmin.tsx  # is this user Bill Look staff?
    useSupportStaff.tsx
    usePosAccess.tsx, useVoiceInput.tsx, useOnlineStatus.ts
  lib/
    invoice.ts            # invoice numbering (shopkeeper code / branch code), totals
    invoicePdf.ts, thermalReceipt.ts, pdfDownload.ts
    modules.ts            # ModuleKey catalog + ROUTE_TO_MODULE (staff permissions)
    offline*.ts, csv.ts, barcode*.ts, states.ts, utils.ts
    admin/api.ts          # callAdminAction() -> admin-actions edge fn, formatINR()
  pages/                  # one file per route (see §4)
  pages/admin/            # admin panel pages
supabase/
  config.toml             # per-function verify_jwt flags
  functions/              # Deno edge functions (auto-deployed)
  migrations/             # managed by tooling — do not hand-edit
```

---

## 4. Routes

**Public:** `/auth`, `/privacy`, `/delete-account`, `/i/:id` (public shared invoice view), `/admin/login`

**Shopkeeper (inside `AppLayout`):**
`/` Dashboard · `/pos` · `/sales` · `/sale_returns` · `/purchases` · `/quotations` · `/quick_invoices`
(each also `/:id` → `InvoiceEditor` with a `type` prop) · `/customers`, `/customers/:id` · `/suppliers`
· `/party-ledger` · `/items` · `/stock` · `/categories` · `/warehouses` · `/batches` · `/branches`
· `/accounts` · `/payments` · `/expenses` · `/loyalty` · `/reports` · `/ai-insights` · `/settings`
· `/team` · `/invoice-design` · `/billing` · `/support`

**Admin (inside `AdminLayout`):** `/admin` overview, `shopkeepers`, `shopkeepers/:id`, `users`,
`tickets`, `plans`, `payments` (SaaS revenue), `customer-invoices`, `reminders`, `subscriptions`,
`invoices` (shop invoices), `audit`, `admins`

**Support:** `/support-agent`

`src/pages/InvoiceEditor.tsx` (~2000 lines) and `src/pages/Pos.tsx` (~1000 lines) are the two hot
files — most billing logic lives there.

---

## 5. Database (public schema)

Tables: `businesses`, `profiles`, `user_roles`, `staff_module_access`, `branches`, `warehouses`,
`categories`, `items`, `batches`, `stock_movements`, `parties`, `invoices`, `invoice_items`,
`invoice_settings`, `invoice_edit_log`, `payments`, `payment_reminders`, `expenses`,
`loyalty_settings`, `loyalty_transactions`, `pos_sessions`, `pos_held_carts`, `pos_user_access`,
`barcode_catalog`, `business_features`, `business_subscriptions`, `subscription_plans`,
`subscription_orders`, `cashfree_webhook_events`, `saas_invoices`, `saas_reminders`,
`platform_admins`, `admin_audit_log`, `support_tickets`, `support_ticket_messages`, `support_staff`.

Enums:
- `app_role`: owner | staff | accountant | admin
- `invoice_type`: sale | purchase | sale_return | purchase_return | quotation | credit_note | debit_note | **non_inventory**
- `invoice_status`: draft | unpaid | partial | paid | overdue | cancelled
- `payment_method`: cash | bank | upi | cheque | card | other · `payment_direction`: in | out
- `stock_movement_type`: opening | purchase | sale | adjustment_in | adjustment_out | damage | transfer
- `party_type`, `item_type`, `support_ticket_status`, `support_ticket_priority`, `support_sender_role`

Security-definer helpers: `has_role`, `is_business_member`, `is_platform_admin`, `is_support_staff`.

**Rules**
- Every tenant table is scoped by `business_id`; RLS uses `is_business_member(business_id)`.
- Roles live in `user_roles` — **never** on `profiles`/`businesses`.
- Every new `public` table needs `GRANT`s in the same migration (authenticated + service_role,
  `anon` only when a policy allows it), then `ENABLE ROW LEVEL SECURITY`, then policies.
- Never touch `auth`, `storage`, `realtime`, `vault` schemas.

---

## 6. Business logic that already caused bugs — respect it

1. **Stock must never go negative.** Enforced by `BEFORE` triggers in Postgres *and* by front-end
   validation in `InvoiceEditor`/`Pos`. Don't bypass either.
2. **No double stock deduction.** `stock_movements` has a unique index; the invoice-item trigger
   (`handle_invoice_item_stock`) is the single source of stock change per line.
3. **Purchase + new batch:** when a batch is created from a purchase bill it already carries the
   received quantity (`sync_item_stock_from_batches`), so `handle_invoice_item_batch` **skips the
   positive add on `purchase`**. Sales / returns still adjust batch quantities.
4. **Quick Invoices (`non_inventory`, prefix `QINV`)** never touch inventory. Keep them excluded
   from stock logic but included in revenue reports.
5. **Invoice numbering** (`src/lib/invoice.ts`): `<shopkeeper code>` + optional `/<branch code>`
   when the invoice is flagged as an online order.
6. **Decimal quantity** is opt-in per item (`allow_decimal_qty`); otherwise inputs are integer-only.
7. **Item display name** = brand + name + flavour + `unit_size` (e.g. "Muscleblaze Whey Protein –
   Coconut 2KG") via `composeItemName` / `composeItemLines`. Use them everywhere an item is shown.
8. **Payments:** partial + split (cash/credit) payments supported; invoice `balance`/`status` are
   derived from actual `payments` rows — keep them in sync, and there must be exactly one trigger
   doing it.
9. **Soft delete:** deleted invoices go to a Trash view, restorable for **180 days**; their payments
   are soft-deleted too.
10. **Invoice edits** are diffed into `invoice_edit_log` and shown as history.
11. **Batches:** expiry can be set via "best before (days)" presets; batch qty updates are additive.
12. **Receivables/payables** always filter on `invoice_date` and are reported "as of" the selected date.

---

## 7. Edge functions (`supabase/functions/`, auto-deployed)

| Function | Purpose | JWT |
|---|---|---|
| `admin-actions` | all privileged admin mutations + audit logging (call via `callAdminAction`) | yes |
| `ai-insights` | AI business insights (Lovable AI Gateway, `LOVABLE_API_KEY`) | yes |
| `parse-purchase-invoice` | OCR/AI parse of a purchase bill image | yes |
| `create-staff`, `create-support-staff` | provision users | yes |
| `cashfree-create-order`, `cashfree-verify-order` | SaaS checkout | yes |
| `cashfree-webhook` | Cashfree callbacks → `cashfree_webhook_events` | **no** |
| `public-invoice` | serves the public `/i/:id` invoice/POS receipt view | **no** |
| `send-payment-reminder` | shopkeeper → customer reminders | yes |
| `send-saas-reminder` | admin → shopkeeper renewal/overdue reminders | yes |

Secrets live in Supabase function env (`Deno.env.get`). Never expose `service_role` key to the client;
the browser always uses the anon key.

---

## 8. Conventions

- Colors/tokens are semantic and defined in `src/index.css` + `tailwind.config.ts`. **Never hardcode**
  `text-white`, `bg-black`, `bg-[#...]` in components.
- Everything must work on **mobile** — the user tests on a phone. Tables get a stacked-card layout,
  and every desktop row action (view / share / edit / delete) must also exist on mobile.
- Currency via `formatINR` (`src/lib/admin/api.ts`) or `toLocaleString("en-IN")`.
- Feedback via `toast` from `sonner`.
- Keep changes scoped; don't refactor unrelated modules.

## 9. Local commands

```bash
npm run dev      # vite dev server on :8080
npm run build
npm run lint
npm run test     # vitest
```

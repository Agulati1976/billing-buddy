
# Proper Admin Panel — Rebuild

A modern, dense SaaS-style admin panel scoped to platform admins only. Single admin role kept; RLS unchanged for existing tables.

## New navigation (sidebar)

```text
Overview      KPIs + charts (signups, revenue, invoices, top shops)
Shopkeepers   businesses list + deep detail
Users         all profiles, last sign-in, linked businesses
Invoices      cross-tenant invoices browser
Payments      cross-tenant payments browser
Plans         per-business plan + feature flags editor
Audit log     admin actions feed
Admins        existing
```

## 1. Overview (redesign)

- 6 KPI cards: Shopkeepers, Users, Invoices (30d), Gross Sales (30d), New signups (7d), Active shops (7d).
- Charts (Recharts): Signups over time (line, 90d), Revenue trend (area, 90d), Invoices per day (bar, 30d).
- Top 10 shopkeepers by revenue (table).
- Recent activity feed (last 20 audit entries).

## 2. Shopkeepers (upgrade)

- Existing list keeps search, adds: plan badge, status badge (active/suspended), revenue total, last invoice date, row actions menu.
- Detail page tabs: **Summary** (KPIs, owner, contact, address, plan), **Invoices**, **Items**, **Parties**, **Staff/Roles**, **Payments**, **Activity**.
- Header actions: Suspend / Reactivate, Reset owner password (email link via edge function), Soft delete.

## 3. Users (new)

- Lists `profiles` joined with: number of businesses owned, roles count, last sign-in (`auth.users.last_sign_in_at` via edge function using service role).
- Search by name/email/phone. Row click → drawer with profile + linked businesses + roles.
- Actions: send password reset, disable user (suspend).

## 4. Invoices browser (new)

- Cross-tenant table of all invoices with filters: business, type, status, date range, min/max amount.
- Server-side pagination (50/page).
- Row → modal with invoice items + payments.

## 5. Payments browser (new)

- Cross-tenant table with filters: business, method, date range.
- KPI strip: total received, count, average.

## 6. Plans & features (new)

- Per-business editor backed by existing `business_features` table.
- Toggle features, set plan tier (free/pro/enterprise), set limits.
- Edits write to `business_features` and create an `admin_audit_log` row.

## 7. Audit log (new)

- New table `admin_audit_log` records every admin action (who, what, target, before/after, when).
- Filter by admin, action type, date.

## Admin actions (suspend / reset / delete)

- New edge function `admin-actions` (verify_jwt=false, validates caller is platform admin via service role).
  - `suspend_business`, `reactivate_business`, `delete_business` (soft, sets `deleted_at`).
  - `reset_user_password` (admin generate recovery link).
  - `suspend_user`, `reactivate_user` (sets `auth.users.banned_until` via admin API).
- Every action writes to `admin_audit_log`.

## Database changes

```sql
-- businesses: status + soft delete
ALTER TABLE public.businesses
  ADD COLUMN status text NOT NULL DEFAULT 'active',  -- active|suspended
  ADD COLUMN deleted_at timestamptz;

-- business_features: plan tier
ALTER TABLE public.business_features
  ADD COLUMN plan text NOT NULL DEFAULT 'free';     -- free|pro|enterprise

-- admin audit log
CREATE TABLE public.admin_audit_log (
  id uuid PK,
  admin_id uuid NOT NULL,           -- auth.users.id
  action text NOT NULL,
  target_type text,                 -- business|user|feature
  target_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
-- GRANTs + RLS: only platform admins can SELECT/INSERT (via is_platform_admin)
```

All RLS additions use existing `public.is_platform_admin(auth.uid())`.

## Design

Modern SaaS admin redesign:
- Slimmer sidebar with section labels, icons, active accent.
- Sticky top bar per page: title, breadcrumbs, primary action, search.
- Dense tables with sticky header, row hover, status pills.
- KPI cards with sparkline + delta vs previous period.
- Recharts for trends; tabular Top-N panels.
- Same design tokens (semantic colors, no hardcoded). Keep responsive.

## Files

**New**
- `src/pages/admin/AdminUsers.tsx`
- `src/pages/admin/AdminInvoices.tsx`
- `src/pages/admin/AdminPayments.tsx`
- `src/pages/admin/AdminPlans.tsx`
- `src/pages/admin/AdminAuditLog.tsx`
- `src/components/admin/KpiCard.tsx`
- `src/components/admin/AdminTopbar.tsx`
- `src/components/admin/StatusBadge.tsx`
- `src/components/admin/RevenueChart.tsx`
- `src/components/admin/SignupsChart.tsx`
- `src/lib/admin/api.ts` (shared queries)
- `supabase/functions/admin-actions/index.ts`

**Edited**
- `src/pages/admin/AdminLayout.tsx` — new sidebar items, redesigned shell.
- `src/pages/admin/AdminOverview.tsx` — KPIs + charts + top shops + recent activity.
- `src/pages/admin/AdminShopkeepers.tsx` — extra columns + action menu.
- `src/pages/admin/AdminShopkeeperDetail.tsx` — tabs + header actions.
- `src/App.tsx` — new admin routes.

## Out of scope

- Multi-tier admin roles (single role kept).
- Email notifications/broadcast.
- Billing integration.
- Migrating existing data; defaults handle backfill.

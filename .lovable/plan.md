
# Vyapar-style Billing Management Software — Roadmap

A clean, business-utility GST billing app for Indian SMBs, built with React + Lovable Cloud (Postgres + Auth). We'll ship in **5 phases**, each fully usable before moving to the next.

## 🎨 Design System
- **Vibe:** Vyapar-style — clean, dense, professional
- **Primary:** Deep business blue (#1E64C8 family) with white surfaces and subtle gray dividers
- **Accents:** Green (paid/positive), Red (overdue/negative), Amber (pending)
- **Layout:** Left sidebar navigation + top bar (business switcher, quick "+ New Sale" button) + main work area
- **Typography:** Inter — tight, tabular numerals for amounts

---

## Phase 1 — Foundation & Auth (Multi-user + Roles)
- Email/password signup & login (Lovable Cloud)
- "Business" entity — user creates a business profile (name, GSTIN, address, logo, phone)
- **Roles:** Owner, Staff, Accountant — stored in a separate `user_roles` table (security-correct)
- Invite team members by email; role-based access enforced via RLS
- Onboarding flow: create business → set GST details → land on dashboard

## Phase 2 — Parties (Customers & Suppliers)
- Add/edit/delete customers and suppliers (name, phone, email, GSTIN, billing address, opening balance)
- Party ledger view — every transaction with running balance (To Receive / To Pay)
- Search, filter, bulk import via CSV
- Quick-call / WhatsApp / Email actions on each party

## Phase 3 — Inventory & Items
- Item master: name, SKU, HSN code, sale price, purchase price, tax %, unit (pcs/kg/box), opening stock
- Service items (no stock tracking)
- Real-time stock levels with low-stock alerts
- Stock adjustment entries (damage, transfer)
- Item-wise sales/purchase report

## Phase 4 — Invoicing & Billing (the core)
- **Sale Invoice** with GST breakup (CGST + SGST for intra-state, IGST for inter-state — auto-detected from state codes)
- Quotation / Estimate → convertible to invoice in one click
- Purchase invoices, Sale Returns, Purchase Returns, Credit/Debit Notes
- Auto invoice numbering with custom prefixes (INV/2025/0001)
- Multiple invoice templates (Tally-style, Modern, Thermal 80mm)
- Print, download PDF, share via WhatsApp/Email
- Payment status: Paid / Partial / Unpaid / Overdue with color chips
- Inventory auto-deducts on sale, auto-adds on purchase

## Phase 5 — Payments, Expenses & Dashboard
- Record Payment-In (against invoices) and Payment-Out (against bills) — Cash, Bank, UPI, Cheque
- Expense tracking with categories (rent, salary, utilities)
- Cashbook & Bankbook views
- **Dashboard:** Today's sales, This month's revenue, Receivables, Payables, Low stock items, Top customers, Sales trend chart (last 30 days)
- **Reports:** Sale/Purchase report, Party statement, Stock summary, Day book, Profit & Loss (basic), GST Sale & Purchase summary (CGST/SGST/IGST totals)

---

## 🗂 Data Model (high-level)
`businesses` · `user_roles` (user_id, business_id, role) · `parties` · `items` · `invoices` + `invoice_items` · `payments` · `expenses` · `stock_movements`

All tables scoped per-business with RLS — users only see data for businesses they belong to.

## 🚀 What we build first (this implementation)
**Phase 1 + Phase 2 fully working** — Auth, business setup, sidebar shell, dashboard skeleton, and complete Parties module. This gives you a real foundation you can click through end-to-end. Then we'll layer in Items → Invoices → Payments in subsequent prompts.

> ⚠️
// Module catalog used for staff access toggles.
export type ModuleKey =
  | "dashboard" | "pos"
  | "sales" | "sale_returns" | "quotations" | "purchases" | "quick_invoices"
  | "customers" | "suppliers" | "party_ledger"
  | "items" | "stock" | "categories" | "warehouses" | "batches" | "branches"
  | "accounts" | "payments" | "expenses" | "loyalty"
  | "reports" | "ai_insights";

export interface ModuleDef { key: ModuleKey; label: string; group: string; }

export const ALL_MODULES: ModuleDef[] = [
  { key: "dashboard",    label: "Dashboard",        group: "Overview" },
  { key: "pos",          label: "Point of Sale",    group: "Quick Actions" },
  { key: "sales",        label: "Sale Invoices",    group: "Sales & Purchases" },
  { key: "sale_returns", label: "Sale Returns",     group: "Sales & Purchases" },
  { key: "quotations",   label: "Quotations",       group: "Sales & Purchases" },
  { key: "purchases",    label: "Purchases",        group: "Sales & Purchases" },
  { key: "quick_invoices", label: "Quick Invoices", group: "Sales & Purchases" },
  { key: "customers",    label: "Customers",        group: "Parties" },
  { key: "suppliers",    label: "Suppliers",        group: "Parties" },
  { key: "party_ledger", label: "Party Ledger",     group: "Parties" },
  { key: "items",        label: "Items",            group: "Inventory" },
  { key: "stock",        label: "Stock Management", group: "Inventory" },
  { key: "categories",   label: "Categories",       group: "Inventory" },
  { key: "warehouses",   label: "Warehouses",       group: "Inventory" },
  { key: "batches",      label: "Batches & Expiry", group: "Inventory" },
  { key: "branches",     label: "Branches",         group: "Inventory" },
  { key: "accounts",     label: "Accounts",         group: "Money" },
  { key: "payments",     label: "Payments",         group: "Money" },
  { key: "expenses",     label: "Expenses",         group: "Money" },
  { key: "loyalty",      label: "Loyalty Rewards",  group: "Money" },
  { key: "reports",      label: "Reports",          group: "Insights" },
  { key: "ai_insights",  label: "AI Insights",      group: "Insights" },
];

export const DEFAULT_STAFF_MODULES: ModuleKey[] = [
  "dashboard", "sales", "sale_returns", "quotations", "purchases",
  "customers", "suppliers", "items", "stock", "payments",
];

// Map sidebar route → module key
export const ROUTE_TO_MODULE: Record<string, ModuleKey> = {
  "/": "dashboard",
  "/pos": "pos",
  "/sales": "sales",
  "/sale_returns": "sale_returns",
  "/quotations": "quotations",
  "/purchases": "purchases",
  "/quick_invoices": "quick_invoices",
  "/customers": "customers",
  "/suppliers": "suppliers",
  "/party-ledger": "party_ledger",
  "/items": "items",
  "/stock": "stock",
  "/categories": "categories",
  "/warehouses": "warehouses",
  "/batches": "batches",
  "/branches": "branches",
  "/accounts": "accounts",
  "/payments": "payments",
  "/expenses": "expenses",
  "/loyalty": "loyalty",
  "/reports": "reports",
  "/ai-insights": "ai_insights",
};

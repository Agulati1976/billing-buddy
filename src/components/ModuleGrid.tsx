import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, FileText, ArrowUpDown, FileEdit, Receipt as ReceiptIcon,
  Users, Truck, Package, Tags, Warehouse, Boxes, Building2, BookOpen,
  Wallet, Gift, BarChart3, Sparkles, Settings,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { usePosAccess } from "@/hooks/usePosAccess";
import type { ModuleKey } from "@/lib/modules";

type Tile = {
  to: string;
  label: string;
  icon: any;
  module?: ModuleKey;
  tone: "primary" | "success" | "warning" | "danger" | "info" | "violet" | "pink" | "teal";
  alwaysVisible?: boolean;
};

const TONE: Record<Tile["tone"], string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger:  "bg-danger-soft text-danger",
  info:    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  violet:  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  pink:    "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  teal:    "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
};

const TILES: Tile[] = [
  { to: "/",            label: "Home",          icon: LayoutDashboard, module: "dashboard",    tone: "primary" },
  { to: "/pos",         label: "POS",           icon: ShoppingCart,    module: "pos",          tone: "success" },
  { to: "/sales",       label: "Sales",         icon: FileText,        module: "sales",        tone: "primary" },
  { to: "/sales/new",   label: "New Sale",      icon: FileText,        module: "sales",        tone: "success" },
  { to: "/sale_returns",label: "Sale Returns",  icon: ArrowUpDown,     module: "sale_returns", tone: "warning" },
  { to: "/purchases",   label: "Purchases",     icon: ReceiptIcon,     module: "purchases",    tone: "violet" },
  { to: "/quotations",  label: "Quotations",    icon: FileEdit,        module: "quotations",   tone: "info" },
  { to: "/quick_invoices", label: "Quick Invoices", icon: FileEdit,    module: "quick_invoices", tone: "teal" },
  { to: "/customers",   label: "Customers",     icon: Users,           module: "customers",    tone: "teal" },
  { to: "/suppliers",   label: "Suppliers",     icon: Truck,           module: "suppliers",    tone: "violet" },
  { to: "/party-ledger",label: "Party Ledger",  icon: BookOpen,        module: "party_ledger", tone: "info" },
  { to: "/items",       label: "Items",         icon: Package,         module: "items",        tone: "warning" },
  { to: "/stock",       label: "Stock",         icon: ArrowUpDown,     module: "stock",        tone: "info" },
  { to: "/categories",  label: "Categories",    icon: Tags,            module: "categories",   tone: "pink" },
  { to: "/warehouses",  label: "Warehouses",    icon: Warehouse,       module: "warehouses",   tone: "teal" },
  { to: "/batches",     label: "Batches",       icon: Boxes,           module: "batches",      tone: "warning" },
  { to: "/branches",    label: "Branches",      icon: Building2,       module: "branches",     tone: "violet" },
  { to: "/accounts",    label: "Accounts",      icon: Wallet,          module: "accounts",     tone: "primary" },
  { to: "/payments",    label: "Payments",      icon: Wallet,          module: "payments",     tone: "success" },
  { to: "/expenses",    label: "Expenses",      icon: ReceiptIcon,     module: "expenses",     tone: "danger" },
  { to: "/loyalty",     label: "Loyalty",       icon: Gift,            module: "loyalty",      tone: "pink" },
  { to: "/reports",     label: "Reports",       icon: BarChart3,       module: "reports",      tone: "info" },
  { to: "/ai-insights", label: "AI Insights",   icon: Sparkles,        module: "ai_insights",  tone: "violet" },
  { to: "/settings",    label: "Settings",      icon: Settings,        tone: "primary",        alwaysVisible: true },
];

interface Props {
  /** When true, also includes the Home tile (default false — usually shown on Home itself). */
  includeHome?: boolean;
  /** Optional click handler (e.g. to close a sheet). */
  onItemClick?: () => void;
}

export function ModuleGrid({ includeHome = false, onItemClick }: Props) {
  const { canSeeModule, isStaff } = usePermissions();
  const { canUsePos } = usePosAccess();

  const tiles = TILES.filter((t) => {
    if (t.to === "/" && !includeHome) return false;
    if (t.to === "/pos" && !canUsePos) return false;
    if (t.alwaysVisible) return true;
    if (!t.module) return true;
    if (isStaff) return canSeeModule(t.module);
    return true;
  });

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {tiles.map((t) => (
        <NavLink
          key={t.to + t.label}
          to={t.to}
          onClick={onItemClick}
          className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 aspect-square text-center transition-transform active:scale-95 hover:border-primary/40 hover:shadow-sm"
        >
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${TONE[t.tone]}`}>
            <t.icon className="h-5 w-5" />
          </div>
          <span className="text-[11px] sm:text-xs font-medium leading-tight line-clamp-2">{t.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

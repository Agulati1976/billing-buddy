import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ArrowUpDown, BarChart3, BookOpen, Boxes, Building2, FileEdit, FileText,
  Gift, LayoutDashboard, LayoutGrid, Package, Receipt as ReceiptIcon, Settings,
  ShoppingCart, Sparkles, Tags, Truck, Users, Wallet, Warehouse,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePosAccess } from "@/hooks/usePosAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { ROUTE_TO_MODULE, type ModuleKey } from "@/lib/modules";
import { cn } from "@/lib/utils";

const itemBase =
  "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors active:bg-muted/60";
const itemActive = "text-primary";

type MobileMenuItem = { to: string; label: string; icon: any; module?: ModuleKey; alwaysVisible?: boolean; end?: boolean };
type MobileMenuGroup = { label: string; items: MobileMenuItem[] };

const MENU_GROUPS: MobileMenuGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard", end: true },
      { to: "/pos", label: "Point of Sale", icon: ShoppingCart, module: "pos" },
    ],
  },
  {
    label: "Sales & Purchases",
    items: [
      { to: "/sales", label: "Sale Invoices", icon: FileText, module: "sales" },
      { to: "/sales/new", label: "New Sale", icon: FileText, module: "sales" },
      { to: "/sale_returns", label: "Sale Returns", icon: ArrowUpDown, module: "sale_returns" },
      { to: "/quotations", label: "Quotations", icon: FileEdit, module: "quotations" },
      { to: "/purchases", label: "Purchases", icon: ReceiptIcon, module: "purchases" },
      { to: "/quick_invoices", label: "Quick Invoices", icon: FileEdit, module: "quick_invoices" },
    ],
  },
  {
    label: "Parties",
    items: [
      { to: "/customers", label: "Customers", icon: Users, module: "customers" },
      { to: "/suppliers", label: "Suppliers", icon: Truck, module: "suppliers" },
      { to: "/party-ledger", label: "Party Ledger", icon: BookOpen, module: "party_ledger" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/items", label: "Items", icon: Package, module: "items" },
      { to: "/stock", label: "Stock Management", icon: ArrowUpDown, module: "stock" },
      { to: "/categories", label: "Categories", icon: Tags, module: "categories" },
      { to: "/warehouses", label: "Warehouses", icon: Warehouse, module: "warehouses" },
      { to: "/batches", label: "Batches & Expiry", icon: Boxes, module: "batches" },
      { to: "/branches", label: "Branches", icon: Building2, module: "branches" },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/accounts", label: "Accounts", icon: Wallet, module: "accounts" },
      { to: "/payments", label: "Payments", icon: Wallet, module: "payments" },
      { to: "/expenses", label: "Expenses", icon: ReceiptIcon, module: "expenses" },
      { to: "/loyalty", label: "Loyalty Rewards", icon: Gift, module: "loyalty" },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
      { to: "/ai-insights", label: "AI Insights", icon: Sparkles, module: "ai_insights" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/billing", label: "Billing & Plans", icon: ReceiptIcon, alwaysVisible: true },
      { to: "/settings", label: "Settings", icon: Settings, alwaysVisible: true },
    ],
  },
];

export function MobileBottomNav() {
  const { canUsePos } = usePosAccess();
  const { canSeeModule, isStaff } = usePermissions();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleGroups = MENU_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const module = item.module ?? ROUTE_TO_MODULE[item.to];
        if (module === "pos" && !canUsePos) return false;
        if (item.alwaysVisible) return true;
        if (isStaff && module) return canSeeModule(module);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border shadow-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-14">
        <NavLink to="/" end className={({ isActive }) => cn(itemBase, isActive && itemActive)}>
          <LayoutDashboard className="h-5 w-5" />
          <span>Home</span>
        </NavLink>
        <NavLink to="/sales" className={({ isActive }) => cn(itemBase, isActive && itemActive)}>
          <FileText className="h-5 w-5" />
          <span>Sales</span>
        </NavLink>
        {canUsePos ? (
          <NavLink to="/pos" className={({ isActive }) => cn(itemBase, isActive && itemActive)}>
            <div className="-mt-5 h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg ring-4 ring-background">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <span className="mt-0.5">POS</span>
          </NavLink>
        ) : (
          <NavLink to="/sales/new" className={({ isActive }) => cn(itemBase, isActive && itemActive)}>
            <div className="-mt-5 h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg ring-4 ring-background">
              <FileText className="h-5 w-5" />
            </div>
            <span className="mt-0.5">New</span>
          </NavLink>
        )}
        <NavLink to="/items" className={({ isActive }) => cn(itemBase, isActive && itemActive)}>
          <Package className="h-5 w-5" />
          <span>Items</span>
        </NavLink>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button type="button" className={itemBase}>
              <LayoutGrid className="h-5 w-5" />
              <span>Menu</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex h-[92dvh] max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl p-0">
            <SheetHeader className="border-b px-4 pb-3 pt-4 text-left">
              <SheetTitle>All Modules</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-3 py-4 pb-8">
              <div className="space-y-5">
                {visibleGroups.map((group) => (
                  <section key={group.label}>
                    <h3 className="mb-2 px-1 text-xs font-semibold uppercase text-muted-foreground">
                      {group.label}
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          onClick={() => setMenuOpen(false)}
                          className={({ isActive }) => cn(
                            "flex min-h-12 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors active:bg-muted",
                            isActive ? "border-primary bg-primary-soft text-primary" : "border-border text-foreground"
                          )}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

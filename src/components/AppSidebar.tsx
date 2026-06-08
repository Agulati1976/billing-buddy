import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Users, Truck, Package, FileText, FileEdit,
  Wallet, Receipt as ReceiptIcon, Settings, Receipt, Tags, Warehouse, Boxes,
  BarChart3, Sparkles, ShoppingCart, Gift, ArrowUpDown, BookOpen, Building2,
} from "lucide-react";
import { usePosAccess } from "@/hooks/usePosAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { ROUTE_TO_MODULE } from "@/lib/modules";
import logoAsset from "@/assets/billlook-logo.png.asset.json";

type NavItem = { to: string; label: string; icon: any; end?: boolean; soon?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Sales & Purchases",
    items: [
      { to: "/sales", label: "Sale Invoices", icon: FileText },
      { to: "/sale_returns", label: "Sale Returns", icon: ArrowUpDown },
      { to: "/quotations", label: "Quotations", icon: FileEdit },
      { to: "/purchases", label: "Purchases", icon: ReceiptIcon },
    ],
  },
  {
    label: "Parties",
    items: [
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/suppliers", label: "Suppliers", icon: Truck },
      { to: "/party-ledger", label: "Party Ledger", icon: BookOpen },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/items", label: "Items", icon: Package },
      { to: "/stock", label: "Stock Management", icon: ArrowUpDown },
      { to: "/categories", label: "Categories", icon: Tags },
      { to: "/warehouses", label: "Warehouses", icon: Warehouse },
      { to: "/batches", label: "Batches & Expiry", icon: Boxes },
      { to: "/branches", label: "Branches", icon: Building2 },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/accounts", label: "Accounts", icon: Wallet },
      { to: "/payments", label: "Payments", icon: Wallet },
      { to: "/expenses", label: "Expenses", icon: ReceiptIcon },
      { to: "/loyalty", label: "Loyalty Rewards", icon: Gift },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/ai-insights", label: "AI Insights", icon: Sparkles },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { canUsePos } = usePosAccess();
  const { canSeeModule, isStaff } = usePermissions();

  const baseGroups = canUsePos
    ? [
        { label: "Quick Actions", items: [{ to: "/pos", label: "Point of Sale", icon: ShoppingCart }] },
        ...groups,
      ]
    : groups;

  const visibleGroups = isStaff
    ? baseGroups
        .map((g) => ({
          ...g,
          items: g.items.filter((it) => {
            const mod = ROUTE_TO_MODULE[it.to];
            return mod ? canSeeModule(mod) : true;
          }),
        }))
        .filter((g) => g.items.length > 0)
    : baseGroups;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="h-8 w-8 rounded-md bg-white flex items-center justify-center shrink-0 overflow-hidden border">
            <img src={logoAsset.url} alt="Bill Look" className="h-full w-full object-contain" />
          </div>
          {!collapsed && <span className="font-bold text-lg">Bill Look</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {visibleGroups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const active = item.end
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink to={item.to} end={item.end}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                          {item.soon && !collapsed && (
                            <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                              Soon
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Settings">
                  <NavLink to="/settings">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

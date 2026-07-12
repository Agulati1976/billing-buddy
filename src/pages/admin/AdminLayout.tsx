import { Navigate, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ShieldCheck, Store, Users, LogOut, LayoutDashboard,
  Receipt, Wallet, Layers, ScrollText, UserCog, CreditCard, FileText, Bell, Menu, LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Overview" },
  { to: "/admin/shopkeepers", icon: Store, label: "Shopkeepers" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/tickets", icon: LifeBuoy, label: "Support Tickets" },
  { to: "/admin/plans", icon: Layers, label: "Plans & Pricing" },
  { to: "/admin/payments", icon: Wallet, label: "SaaS Revenue" },
  { to: "/admin/customer-invoices", icon: FileText, label: "Customer Invoices" },
  { to: "/admin/reminders", icon: Bell, label: "Reminders" },
  { to: "/admin/subscriptions", icon: CreditCard, label: "Subscriptions" },
  { to: "/admin/invoices", icon: Receipt, label: "Shop Invoices" },
  { to: "/admin/audit", icon: ScrollText, label: "Audit log" },
  { to: "/admin/admins", icon: UserCog, label: "Admins" },
];

// Items shown in the mobile bottom bar (rest live in the drawer)
const bottomNav = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Home" },
  { to: "/admin/shopkeepers", icon: Store, label: "Shops" },
  { to: "/admin/tickets", icon: LifeBuoy, label: "Tickets" },
  { to: "/admin/payments", icon: Wallet, label: "Revenue" },
];

export default function AdminLayout() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, loading } = usePlatformAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!isAdmin) return <Navigate to="/admin/login" replace />;

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
      isActive
        ? "bg-primary text-primary-foreground font-medium shadow-sm"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  const currentTitle =
    nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label ?? "Admin";

  const SidebarInner = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Bill Look</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Admin Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Platform
        </div>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={linkCls}
            onClick={onNavigate}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t space-y-1">
        <div className="px-2 text-xs truncate text-muted-foreground" title={user.email ?? ""}>
          {user.email}
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-background flex-col">
        <SidebarInner />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-auto">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 border-b bg-background/95 backdrop-blur">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 flex flex-col">
              <SheetHeader className="sr-only">
                <SheetTitle>Admin navigation</SheetTitle>
              </SheetHeader>
              <SidebarInner onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="font-semibold text-sm leading-tight">{currentTitle}</div>
          </div>
        </header>

        <div className="p-4 md:p-6 max-w-[1400px] w-full mx-auto pb-24 md:pb-6">
          <Outlet />
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 h-16">
            {bottomNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-1 text-[11px]",
                    isActive ? "text-primary font-medium" : "text-muted-foreground"
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
            >
              <Menu className="h-5 w-5" />
              More
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
}

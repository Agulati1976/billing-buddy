import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Store, Users, LogOut, LayoutDashboard,
  Receipt, Wallet, Layers, ScrollText, UserCog, CreditCard, FileText, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Overview" },
  { to: "/admin/shopkeepers", icon: Store, label: "Shopkeepers" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/plans", icon: Layers, label: "Plans & Pricing" },
  { to: "/admin/payments", icon: Wallet, label: "SaaS Revenue" },
  { to: "/admin/customer-invoices", icon: FileText, label: "Customer Invoices" },
  { to: "/admin/reminders", icon: Bell, label: "Reminders" },
  { to: "/admin/subscriptions", icon: CreditCard, label: "Subscriptions" },
  { to: "/admin/invoices", icon: Receipt, label: "Shop Invoices" },
  { to: "/admin/audit", icon: ScrollText, label: "Audit log" },
  { to: "/admin/admins", icon: UserCog, label: "Admins" },
];

export default function AdminLayout() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, loading } = usePlatformAdmin();
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 border-r bg-background flex flex-col">
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
            <NavLink key={item.to} to={item.to} end={item.end} className={linkCls}>
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
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Store, Users, LogOut, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

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
      "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
      isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
    );

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-muted/20">
      <aside className="w-60 border-r bg-background flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Admin Portal</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/admin" end className={linkCls}>
            <LayoutDashboard className="h-4 w-4" /> Overview
          </NavLink>
          <NavLink to="/admin/shopkeepers" className={linkCls}>
            <Store className="h-4 w-4" /> Shopkeepers
          </NavLink>
          <NavLink to="/admin/admins" className={linkCls}>
            <Users className="h-4 w-4" /> Admins
          </NavLink>
        </nav>
        <div className="p-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

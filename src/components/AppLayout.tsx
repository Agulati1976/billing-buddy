import { Navigate, Outlet, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useSupportStaff } from "@/hooks/useSupportStaff";
import { usePermissions } from "@/hooks/usePermissions";
import { ROUTE_TO_MODULE } from "@/lib/modules";
import { toast } from "sonner";

// Maps a URL path to its gated module, so staff with restricted module access
// can't reach a hidden page just by navigating there directly (the nav links
// hiding a route was previously the only guard — this is the actual backstop).
function moduleForPath(pathname: string) {
  if (ROUTE_TO_MODULE[pathname]) return ROUTE_TO_MODULE[pathname];
  const base = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
  return ROUTE_TO_MODULE[base] ?? null;
}

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { businesses, loading: bizLoading } = useBusiness();
  const { isAdmin, loading: adminLoading } = usePlatformAdmin();
  const { isSupportStaff, loading: supportLoading } = useSupportStaff();
  const perms = usePermissions();
  const location = useLocation();

  if (authLoading || bizLoading || adminLoading || supportLoading || perms.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (businesses.length === 0) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    if (isSupportStaff) return <Navigate to="/support-agent" replace />;
    return <Navigate to="/onboarding" replace />;
  }

  // Dashboard ("/") is always exempt — it's the safe redirect target below, so
  // gating it too could loop.
  if (perms.isStaff && location.pathname !== "/") {
    const mod = moduleForPath(location.pathname);
    if (mod && !perms.canSeeModule(mod)) {
      toast.error("You don't have access to this section");
      return <Navigate to="/" replace />;
    }
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/20">
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <AppTopbar />
          <main className="flex-1 p-3 sm:p-6 overflow-auto pb-24 md:pb-6">
            <Outlet />
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}


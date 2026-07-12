import { Navigate, Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useSupportStaff } from "@/hooks/useSupportStaff";

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { businesses, loading: bizLoading } = useBusiness();
  const { isAdmin, loading: adminLoading } = usePlatformAdmin();
  const { isSupportStaff, loading: supportLoading } = useSupportStaff();

  if (authLoading || bizLoading || adminLoading || supportLoading) {
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


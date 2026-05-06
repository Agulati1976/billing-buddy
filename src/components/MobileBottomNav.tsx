import { NavLink } from "react-router-dom";
import { LayoutDashboard, FileText, ShoppingCart, Package, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { usePosAccess } from "@/hooks/usePosAccess";
import { cn } from "@/lib/utils";

const itemBase =
  "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors active:bg-muted/60";
const itemActive = "text-primary";

export function MobileBottomNav() {
  const { setOpenMobile } = useSidebar();
  const { canUsePos } = usePosAccess();

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
        <button type="button" onClick={() => setOpenMobile(true)} className={itemBase}>
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}

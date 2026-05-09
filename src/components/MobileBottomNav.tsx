import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, FileText, ShoppingCart, Package, LayoutGrid } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePosAccess } from "@/hooks/usePosAccess";
import { cn } from "@/lib/utils";
import { ModuleGrid } from "./ModuleGrid";

const itemBase =
  "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors active:bg-muted/60";
const itemActive = "text-primary";

export function MobileBottomNav() {
  const { canUsePos } = usePosAccess();
  const [menuOpen, setMenuOpen] = useState(false);

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
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="text-left mb-4">
              <SheetTitle>All Modules</SheetTitle>
            </SheetHeader>
            <ModuleGrid includeHome onItemClick={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

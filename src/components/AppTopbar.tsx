import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, LogOut, Building2, Check, ChevronDown, ChevronLeft } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { OfflineBadge } from "@/components/OfflineBadge";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";

const TITLES: Record<string, string> = {
  "/": "Home",
  "/sales": "Sales",
  "/sales/new": "New Sale",
  "/pos": "POS",
  "/items": "Items",
  "/parties": "Parties",
  "/payments": "Payments",
  "/accounts": "Accounts",
  "/expenses": "Expenses",
  "/reports": "Reports",
  "/settings": "Settings",
  "/categories": "Categories",
  "/warehouses": "Warehouses",
  "/batches": "Batches",
  "/stock": "Stock",
  "/loyalty": "Loyalty",
  "/team": "Team",
  "/invoice-design": "Invoice Design",
  "/ai-insights": "AI Insights",
};

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  // partial matches
  const seg = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
  return TITLES[seg] ?? "";
}

export function AppTopbar() {
  const { businesses, current, setCurrent } = useBusiness();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();
  const isHome = location.pathname === "/";
  const title = getTitle(location.pathname);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <header
      className="app-chrome border-b bg-card sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-card/85"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-14 flex items-center gap-2 sm:gap-3 px-2 sm:px-4">
        {/* Desktop: sidebar trigger */}
        <div className="hidden md:flex">
          <SidebarTrigger />
        </div>

        {/* Mobile: back button on inner pages */}
        {!isHome && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden -ml-1 h-10 w-10 rounded-full"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            aria-label="Back"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        )}

        {/* Mobile page title (when on inner page) */}
        {!isHome && title && (
          <h1 className="md:hidden text-base font-semibold truncate flex-1">{title}</h1>
        )}

        {/* Business switcher — full on desktop, only on home for mobile */}
        {current && (isHome || true) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-9 gap-2 px-2 sm:px-3 max-w-[160px] sm:max-w-[260px] ${
                  !isHome ? "hidden md:inline-flex" : ""
                }`}
              >
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate text-sm">{current.name}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                Switch business
              </DropdownMenuLabel>
              {businesses.map((b) => (
                <DropdownMenuItem key={b.id} onClick={() => setCurrent(b)} className="gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.id === current.id && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/onboarding")} className="text-primary">
                <Plus className="h-4 w-4 mr-1" /> Add new business
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <OfflineBadge />
          <SyncStatusBadge />
          <Button size="sm" className="gap-1.5 hidden sm:inline-flex" onClick={() => navigate("/sales/new")}>
            <Plus className="h-4 w-4" /> New Sale
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full h-10 w-10">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium truncate">{user?.email}</div>
                <div className="text-xs text-muted-foreground">Signed in</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

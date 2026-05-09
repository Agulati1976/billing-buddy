import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { BusinessProvider } from "@/hooks/useBusiness";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Parties from "./pages/Parties";
import CustomerDetail from "./pages/CustomerDetail";
import Items from "./pages/Items";
import Categories from "./pages/Categories";
import Warehouses from "./pages/Warehouses";
import Batches from "./pages/Batches";
import StockManagement from "./pages/StockManagement";
import Invoices from "./pages/Invoices";
import InvoiceEditor from "./pages/InvoiceEditor";
import Payments from "./pages/Payments";
import Expenses from "./pages/Expenses";
import Settings from "./pages/Settings";
import Team from "./pages/Team";
import InvoiceDesign from "./pages/InvoiceDesign";
import Reports from "./pages/Reports";
import AiInsights from "./pages/AiInsights";
import Loyalty from "./pages/Loyalty";
import Pos from "./pages/Pos";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminShopkeepers from "./pages/admin/AdminShopkeepers";
import AdminShopkeeperDetail from "./pages/admin/AdminShopkeeperDetail";
import AdminAdmins from "./pages/admin/AdminAdmins";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BusinessProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOverview />} />
                <Route path="shopkeepers" element={<AdminShopkeepers />} />
                <Route path="shopkeepers/:id" element={<AdminShopkeeperDetail />} />
                <Route path="admins" element={<AdminAdmins />} />
              </Route>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/customers" element={<Parties type="customer" />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/suppliers" element={<Parties type="supplier" />} />
                <Route path="/suppliers/:id" element={<CustomerDetail />} />
                <Route path="/items" element={<Items />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/warehouses" element={<Warehouses />} />
                <Route path="/batches" element={<Batches />} />
                <Route path="/stock" element={<StockManagement />} />
                <Route path="/sales" element={<Invoices type="sale" />} />
                <Route path="/sales/:id" element={<InvoiceEditor type="sale" />} />
                <Route path="/sale_returns" element={<Invoices type="sale_return" />} />
                <Route path="/sale_returns/:id" element={<InvoiceEditor type="sale_return" />} />
                <Route path="/purchases" element={<Invoices type="purchase" />} />
                <Route path="/purchases/:id" element={<InvoiceEditor type="purchase" />} />
                <Route path="/quotations" element={<Invoices type="quotation" />} />
                <Route path="/quotations/:id" element={<InvoiceEditor type="quotation" />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/ai-insights" element={<AiInsights />} />
                <Route path="/loyalty" element={<Loyalty />} />
                <Route path="/pos" element={<Pos />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/team" element={<Team />} />
                <Route path="/settings/invoice" element={<InvoiceDesign />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BusinessProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

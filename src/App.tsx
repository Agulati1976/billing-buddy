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
import Invoices from "./pages/Invoices";
import InvoiceEditor from "./pages/InvoiceEditor";
import Payments from "./pages/Payments";
import Expenses from "./pages/Expenses";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import AiInsights from "./pages/AiInsights";
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
                <Route path="/sales" element={<Invoices type="sale" />} />
                <Route path="/sales/:id" element={<InvoiceEditor type="sale" />} />
                <Route path="/purchases" element={<Invoices type="purchase" />} />
                <Route path="/purchases/:id" element={<InvoiceEditor type="purchase" />} />
                <Route path="/quotations" element={<Invoices type="quotation" />} />
                <Route path="/quotations/:id" element={<InvoiceEditor type="quotation" />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/ai-insights" element={<AiInsights />} />
                <Route path="/settings" element={<Settings />} />
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

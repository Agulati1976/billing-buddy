import { Card } from "@/components/ui/card";
import { useBusiness } from "@/hooks/useBusiness";
import { ArrowDownRight, ArrowUpRight, Package, TrendingUp, Users, Wallet } from "lucide-react";
import { formatINR } from "@/lib/states";

const StatCard = ({
  label, value, icon: Icon, tone = "primary",
}: { label: string; value: string; icon: any; tone?: "primary" | "success" | "warning" | "danger" }) => {
  const toneMap = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1 num">{value}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
};

export default function Dashboard() {
  const { current } = useBusiness();
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back to <span className="font-medium text-foreground">{current?.name}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Sales" value={formatINR(0)} icon={TrendingUp} tone="primary" />
        <StatCard label="This Month" value={formatINR(0)} icon={ArrowUpRight} tone="success" />
        <StatCard label="To Receive" value={formatINR(0)} icon={ArrowDownRight} tone="warning" />
        <StatCard label="To Pay" value={formatINR(0)} icon={Wallet} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Top Customers</h2>
          </div>
          <p className="text-sm text-muted-foreground">No invoices yet. Once you start billing, your top customers appear here.</p>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Low Stock Alerts</h2>
          </div>
          <p className="text-sm text-muted-foreground">Inventory module coming soon.</p>
        </Card>
      </div>
    </div>
  );
}

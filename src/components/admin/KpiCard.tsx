import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: number | null;
  hint?: string;
  loading?: boolean;
}

export function KpiCard({ label, value, icon: Icon, delta, hint, loading }: Props) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">
        {loading ? "…" : value}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {typeof delta === "number" ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-emerald-600" : "text-rose-600")}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

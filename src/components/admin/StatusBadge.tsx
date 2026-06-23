import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  suspended: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  deleted: "bg-muted text-muted-foreground border-border",
  free: "bg-muted text-muted-foreground border-border",
  pro: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  enterprise: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status ?? "active").toLowerCase();
  return (
    <Badge variant="outline" className={cn("capitalize font-medium", map[key])}>
      {key}
    </Badge>
  );
}

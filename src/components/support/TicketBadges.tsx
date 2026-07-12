import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMap: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  waiting_customer: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

const priorityMap: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  high: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  urgent: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
};

export function TicketStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={cn("capitalize font-medium", statusMap[status])}>
      {label}
    </Badge>
  );
}

export function TicketPriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize font-medium", priorityMap[priority])}>
      {priority}
    </Badge>
  );
}

import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CloudUpload, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { listOutbox, clearOutbox, deleteOutbox, OUTBOX_EVENT, type OutboxOp } from "@/lib/offlineDb";
import { drainOutbox } from "@/lib/offlineSync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function SyncStatusBadge() {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const online = useOnlineStatus();

  const refresh = async () => setOps(await listOutbox());

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener(OUTBOX_EVENT, h);
    return () => window.removeEventListener(OUTBOX_EVENT, h);
  }, []);

  if (ops.length === 0) return null;

  const failedCount = ops.filter((o) => o.failed).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 rounded-full"
          title={`${ops.length} pending change${ops.length === 1 ? "" : "s"} to sync`}
        >
          {failedCount > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <CloudUpload className="h-3.5 w-3.5" />
          )}
          <span className="text-xs font-medium">{ops.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b">
          <div className="font-medium text-sm">Pending sync</div>
          <div className="text-xs text-muted-foreground">
            {online
              ? "Will sync to the server now."
              : "You're offline — these will sync when reconnected."}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y">
          {ops.map((op) => (
            <div key={op.id} className="p-2.5 text-xs flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium capitalize">
                  {op.op === "insertMany" ? "Insert (bulk)" : op.op} · {op.table}
                </div>
                <div className="text-muted-foreground">
                  {new Date(op.createdAt).toLocaleString()}
                  {op.attempts > 0 ? ` · ${op.attempts} retr${op.attempts === 1 ? "y" : "ies"}` : ""}
                </div>
                {op.failed && (
                  <div className="text-destructive mt-0.5 line-clamp-2">
                    Failed: {op.lastError || "Unknown error"}
                  </div>
                )}
              </div>
              {op.failed && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={async () => { await deleteOutbox(op.id); refresh(); }}
                  title="Discard"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => drainOutbox()}
            disabled={!online}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync now
          </Button>
          {failedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={async () => { await clearOutbox(); refresh(); }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

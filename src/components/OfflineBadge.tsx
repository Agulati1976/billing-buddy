import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export function OfflineBadge() {
  const online = useOnlineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowBackOnline(false);
    } else if (wasOffline.current) {
      setShowBackOnline(true);
      const t = setTimeout(() => setShowBackOnline(false), 2500);
      return () => clearTimeout(t);
    }
  }, [online]);

  if (online && !showBackOnline) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
        online
          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
      )}
      title={online ? "Back online" : "You're offline — viewing cached data"}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{online ? "Back online" : "Offline"}</span>
    </div>
  );
}

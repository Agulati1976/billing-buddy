import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initOfflineSync } from "@/lib/offlineSync";
import { initNative } from "@/lib/native";

createRoot(document.getElementById("root")!).render(<App />);

// Start outbox drainer (runs in foreground; safe in iframe too).
initOfflineSync();

// Native splash hide + status bar theming (no-op on web).
initNative();

// Service worker registration with iframe / Lovable preview guard.
// SW is intentionally disabled inside the editor preview to avoid stale caches.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("lovableproject.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

if (isInIframe || isPreviewHost) {
  // Make sure no stale SW lingers in preview
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  }
} else if ("serviceWorker" in navigator) {
  import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox("/sw.js", { scope: "/" });
    wb.addEventListener("waiting", () => {
      // Auto-activate updated SW
      wb.messageSkipWaiting();
    });
    wb.addEventListener("controlling", () => {
      window.location.reload();
    });
    wb.register().catch(() => {
      /* no-op */
    });
  });
}

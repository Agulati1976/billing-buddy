import { forwardRef, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, AlertCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScanned: (code: string) => void;
}

type PermState = "idle" | "requesting" | "granted" | "denied" | "no-camera" | "insecure" | "error";

export const BarcodeScanner = forwardRef<HTMLDivElement, Props>(function BarcodeScanner({ open, onOpenChange, onScanned }, _ref) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "barcode-scanner-region";
  const [perm, setPerm] = useState<PermState>("idle");
  const [errMsg, setErrMsg] = useState<string>("");

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setPerm("idle");
      setErrMsg("");
      return;
    }
    // Insecure context check (camera requires HTTPS or localhost)
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setPerm("insecure");
      setErrMsg("Camera requires HTTPS. Open this site over https:// to scan.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPerm("error");
      setErrMsg("Camera API not supported in this browser.");
      return;
    }
  }, [open]);

  // Stop scanner on close/unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) {
      stopScanner();
    }
  }, [open]);

  async function stopScanner() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
      await s.clear();
    } catch {}
  }

  async function requestAndStart() {
    setErrMsg("");
    setPerm("requesting");
    try {
      // Step 1: explicit getUserMedia call from a user-gesture click → triggers permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      // Stop the probe stream immediately; html5-qrcode will open its own
      stream.getTracks().forEach((t) => t.stop());
      setPerm("granted");

      // Step 2: start html5-qrcode scanner
      // Wait a tick to ensure the container div is mounted
      await new Promise((r) => setTimeout(r, 50));
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      let handled = false;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (decoded) => {
          if (handled) return;
          handled = true;
          onScanned(decoded);
          stopScanner().finally(() => onOpenChange(false));
        },
        () => {} // ignore decode errors
      );
    } catch (err: any) {
      console.error("Camera permission/start failed", err);
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPerm("denied");
        setErrMsg("Camera permission denied. Allow camera access in your browser settings, then try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setPerm("no-camera");
        setErrMsg("No camera found on this device.");
      } else if (name === "NotReadableError") {
        setPerm("error");
        setErrMsg("Camera is in use by another application. Close it and try again.");
      } else {
        setPerm("error");
        setErrMsg(err?.message || "Failed to start camera.");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) stopScanner();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Barcode</DialogTitle>
          <DialogDescription>
            Use your device camera to scan a product barcode.
          </DialogDescription>
        </DialogHeader>

        {perm === "granted" ? (
          <>
            <div id={containerId} className="w-full rounded-md overflow-hidden bg-black" style={{ minHeight: 280 }} />
            <p className="text-xs text-muted-foreground text-center">
              Point your camera at a barcode.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            {perm === "idle" || perm === "requesting" ? (
              <>
                <Camera className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Tap the button below to allow camera access and start scanning.
                </p>
                <Button onClick={requestAndStart} disabled={perm === "requesting"}>
                  {perm === "requesting" ? "Requesting access…" : "Enable Camera"}
                </Button>
              </>
            ) : (
              <>
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-foreground font-medium">Cannot access camera</p>
                <p className="text-xs text-muted-foreground max-w-xs">{errMsg}</p>
                {perm !== "insecure" && perm !== "no-camera" && (
                  <Button variant="outline" onClick={requestAndStart}>
                    Try again
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

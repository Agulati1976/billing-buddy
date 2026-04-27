import { forwardRef, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScanned: (code: string) => void;
}

export const BarcodeScanner = forwardRef<HTMLDivElement, Props>(function BarcodeScanner({ open, onOpenChange, onScanned }, _ref) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "barcode-scanner-region";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      try {
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decoded) => {
            if (cancelled) return;
            cancelled = true;
            onScanned(decoded);
            stop();
            onOpenChange(false);
          },
          () => {} // ignore decode errors
        );
      } catch (err) {
        console.error("Camera start failed", err);
      }
    };

    const stop = async () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      try {
        if (s.isScanning) await s.stop();
        await s.clear();
      } catch {}
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onScanned, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Barcode</DialogTitle>
        </DialogHeader>
        <div id={containerId} className="w-full rounded-md overflow-hidden bg-black" style={{ minHeight: 280 }} />
        <p className="text-xs text-muted-foreground text-center">
          Point your camera at a barcode. Allow camera permission if prompted.
        </p>
      </DialogContent>
    </Dialog>
  );
}

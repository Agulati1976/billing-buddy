import { useEffect, useRef } from "react";

interface Options {
  /** Only listens while true — pass e.g. a dialog's `open` state. Defaults to true. */
  enabled?: boolean;
  /** Minimum characters before Enter to count as a scan, not a stray keypress. */
  minLength?: number;
  /** Max gap (ms) between keystrokes that still counts as "fast" (scanner-speed). */
  maxIntervalMs?: number;
}

/**
 * Detects a physical USB/Bluetooth barcode scanner running in "keyboard wedge"
 * mode — the standard mode for cheap retail scanners. To the OS it looks just
 * like a keyboard: scanning a barcode "types" its characters far faster than a
 * human can (each keystroke a few ms apart) and finishes with Enter (some
 * scanners send Tab instead). This hook tells the two apart by timing alone,
 * so it's safe to leave mounted everywhere — normal human typing, anywhere on
 * the page, never sustains a sub-40ms-per-key streak long enough to trigger it.
 *
 * Fires `onScan(code)` with the scanned string. Works regardless of which
 * element has focus (or none) — no need to click into a specific field first.
 */
export function useHardwareScanner(onScan: (code: string) => void, options: Options = {}) {
  const { enabled = true, minLength = 4, maxIntervalMs = 40 } = options;
  const bufferRef = useRef("");
  const lastTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const finish = (e: KeyboardEvent) => {
      const code = bufferRef.current;
      bufferRef.current = "";
      if (code.length >= minLength) {
        e.preventDefault();
        e.stopPropagation();
        onScanRef.current(code);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();
      const gap = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (e.key === "Enter" || e.key === "Tab") {
        finish(e);
        return;
      }

      // Anything that isn't a single printable character (Shift, Ctrl, arrow
      // keys, etc.) breaks the fast streak — reset so normal keyboard/mouse
      // use never gets mistaken for a scan.
      if (e.key.length !== 1) {
        bufferRef.current = "";
        return;
      }

      // A gap this large means a human just started typing (or is still
      // typing) — restart the buffer from this keystroke.
      bufferRef.current = gap > maxIntervalMs ? e.key : bufferRef.current + e.key;
    };

    // Capture phase, so a detected scan's Enter/Tab can be stopped before it
    // reaches whatever field happened to be focused (e.g. a search box's own
    // Enter handler), avoiding double-handling the same scan.
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, minLength, maxIntervalMs]);
}

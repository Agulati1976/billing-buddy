import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHardwareScanner } from "./useHardwareScanner";

function dispatchKey(key: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("useHardwareScanner", () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("fires onScan for a fast keystroke burst + Enter (real scanner behavior)", () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareScanner(onScan));

    const code = "8901030875649"; // realistic EAN-13
    for (const ch of code) {
      dispatchKey(ch);
      now += 8; // ~8ms between keys — typical hardware scanner speed
    }
    dispatchKey("Enter");

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(code);
  });

  it("does NOT fire for normal slow human typing + Enter", () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareScanner(onScan));

    for (const ch of "1234") {
      dispatchKey(ch);
      now += 150; // ~150ms between keys — realistic human typing speed
    }
    dispatchKey("Enter");

    expect(onScan).not.toHaveBeenCalled();
  });

  it("does NOT fire for a short accidental fast burst below minLength", () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareScanner(onScan, { minLength: 4 }));

    dispatchKey("a"); now += 5;
    dispatchKey("b"); now += 5;
    dispatchKey("Enter");

    expect(onScan).not.toHaveBeenCalled();
  });

  it("also fires on Tab (some scanners use Tab as terminator)", () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareScanner(onScan));

    for (const ch of "12345678") {
      dispatchKey(ch);
      now += 6;
    }
    dispatchKey("Tab");

    expect(onScan).toHaveBeenCalledWith("12345678");
  });

  it("does nothing while disabled", () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareScanner(onScan, { enabled: false }));

    for (const ch of "12345678") {
      dispatchKey(ch);
      now += 6;
    }
    dispatchKey("Enter");

    expect(onScan).not.toHaveBeenCalled();
  });

  it("resets buffer on a slow gap mid-typing, then a genuine fast scan right after still works", () => {
    const onScan = vi.fn();
    renderHook(() => useHardwareScanner(onScan));

    // Human types "hello" slowly...
    for (const ch of "hello") {
      dispatchKey(ch);
      now += 200;
    }
    dispatchKey("Enter");
    expect(onScan).not.toHaveBeenCalled();

    // ...then immediately scans a real barcode fast.
    for (const ch of "77889900") {
      dispatchKey(ch);
      now += 7;
    }
    dispatchKey("Enter");
    expect(onScan).toHaveBeenCalledWith("77889900");
  });
});

// Generate a Code128 barcode as a PNG data URL (for PDF embedding / UI display).
import JsBarcode from "jsbarcode";

export function makeBarcodeDataUrl(
  value: string,
  opts: { width?: number; height?: number; displayValue?: boolean; fontSize?: number } = {}
): string {
  if (!value) return "";
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: "CODE128",
      width: opts.width ?? 1.6,
      height: opts.height ?? 40,
      displayValue: opts.displayValue ?? true,
      fontSize: opts.fontSize ?? 12,
      margin: 4,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("barcode gen failed", e);
    return "";
  }
}

// Cross-platform PDF saver. On web, triggers browser download.
// On Capacitor native (Android/iOS), writes to Documents and opens the share sheet.
import { Capacitor } from "@capacitor/core";
import type jsPDF from "jspdf";

export async function savePdf(doc: jsPDF, filename: string) {
  if (!Capacitor.isNativePlatform()) {
    doc.save(filename);
    return;
  }

  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    // jsPDF: get base64 (without "data:..." prefix)
    const dataUri = doc.output("datauristring") as string;
    const base64 = dataUri.split(",")[1] ?? "";

    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });

    try {
      await Share.share({
        title: filename,
        text: "Your PDF is ready",
        url: written.uri,
        dialogTitle: "Save or share PDF",
      });
    } catch {
      // user dismissed share — file is still saved in Documents
    }
  } catch (e) {
    // Fallback: open blob URL in new tab
    try {
      const url = doc.output("bloburl") as unknown as string;
      window.open(url, "_blank");
    } catch {
      // last resort
      doc.save(filename);
    }
  }
}

// Generic helper for arbitrary blobs (e.g., CSV) on native.
export async function saveBlob(blob: Blob, filename: string) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const result = r.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    try {
      await Share.share({ title: filename, url: written.uri, dialogTitle: "Save or share file" });
    } catch {/* dismissed */}
  } catch {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }
}

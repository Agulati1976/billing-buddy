// Lightweight CSV builder + download helper
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

export async function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = toCsv(rows);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const { saveBlob } = await import("./pdfDownload");
  await saveBlob(blob, filename);
}

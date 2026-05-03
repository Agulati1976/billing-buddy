import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, ArrowLeft, Eye, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { useBusiness } from "@/hooks/useBusiness";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateInvoicePdf, type InvoiceDesign } from "@/lib/invoicePdf";

const TEMPLATES = [
  { id: "classic", label: "Classic", desc: "Coloured header band, full details. Best for B2B." },
  { id: "modern",  label: "Modern",  desc: "Clean side accent line, lots of whitespace." },
  { id: "minimal", label: "Minimal", desc: "Black & white, no colour. Lowest ink, tidy." },
];

const PRESET_COLORS = ["#2563EB", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#111827"];

interface Settings {
  template: string;
  accent_color: string;
  footer_text: string;
  default_terms: string;
  default_notes: string;
  signature_label: string;
  show_signature: boolean;
  show_amount_in_words: boolean;
  upi_id: string;
  upi_payee_name: string;
  show_upi_qr: boolean;
}

const DEFAULTS: Settings = {
  template: "classic",
  accent_color: "#2563EB",
  footer_text: "This is a computer-generated invoice and does not require a physical signature.",
  default_terms: "",
  default_notes: "",
  signature_label: "Authorised Signatory",
  show_signature: true,
  show_amount_in_words: true,
  upi_id: "",
  upi_payee_name: "",
  show_upi_qr: true,
};

export default function InvoiceDesign() {
  const { current } = useBusiness();
  const { canEditSettings, loading: permsLoading } = usePermissions();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!current) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("invoice_settings").select("*").eq("business_id", current.id).maybeSingle();
      if (data) setS({
        template: data.template, accent_color: data.accent_color,
        footer_text: data.footer_text ?? "", default_terms: data.default_terms ?? "",
        default_notes: data.default_notes ?? "",
        signature_label: data.signature_label ?? "Authorised Signatory",
        show_signature: data.show_signature, show_amount_in_words: data.show_amount_in_words,
        upi_id: (data as any).upi_id ?? "",
        upi_payee_name: (data as any).upi_payee_name ?? "",
        show_upi_qr: (data as any).show_upi_qr ?? true,
      });
      setLoading(false);
    })();
  }, [current?.id]);

  const save = async () => {
    if (!current) return;
    setSaving(true);
    const payload = { business_id: current.id, ...s };
    const { error } = await supabase
      .from("invoice_settings").upsert(payload, { onConflict: "business_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Invoice design saved");
  };

  const preview = async () => {
    if (!current) return;
    const design: InvoiceDesign = { ...s };
    const doc = await generateInvoicePdf(
      {
        name: current.name, gstin: current.gstin, phone: current.phone, email: current.email,
        address: current.address, state: current.state, state_code: current.state_code,
      },
      {
        name: "Sample Customer", gstin: "07AABCU9603R1ZX",
        billing_address: "123 Sample Street, City",
        phone: "+91 99999 99999", email: "sample@customer.com",
        state: "Delhi", state_code: "07",
      },
      {
        type: "sale", invoice_number: "PREVIEW-001",
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: null, is_inter_state: true,
        subtotal: 10000, discount_amount: 500, taxable_total: 9500,
        cgst_amount: 0, sgst_amount: 0, igst_amount: 1710,
        round_off: 0, total_amount: 11210,
        notes: s.default_notes, terms: s.default_terms,
        lines: [
          { item_name: "Sample Product A", hsn_code: "8471", quantity: 2, unit: "pcs", price: 3000, discount_pct: 0, tax_rate: 18, taxable_amount: 6000, tax_amount: 1080, total_amount: 7080 },
          { item_name: "Sample Service B", hsn_code: "998314", quantity: 1, unit: "hr",  price: 4000, discount_pct: 12.5, tax_rate: 18, taxable_amount: 3500, tax_amount: 630,  total_amount: 4130 },
        ],
      },
      design,
    );
    const url = doc.output("bloburl");
    window.open(url, "_blank");
  };

  if (permsLoading || loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" /> Invoice Design
          </h1>
          <p className="text-sm text-muted-foreground">Customize how your invoices look when downloaded as PDF.</p>
        </div>
        <Button variant="outline" onClick={preview}><Eye className="h-4 w-4" /> Preview</Button>
        <Button onClick={save} disabled={saving || !canEditSettings}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {!canEditSettings && (
        <Card className="p-4 border-warning/40 text-sm">
          You can preview but only owners and admins can save changes.
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div>
          <Label className="text-base">Template</Label>
          <p className="text-xs text-muted-foreground mb-3">Pick the visual style.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setS({ ...s, template: t.id })}
                className={`text-left p-4 rounded-lg border-2 transition ${
                  s.template === t.id ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <Label className="text-base">Accent colour</Label>
          <p className="text-xs text-muted-foreground mb-3">Used for the header band, totals strip, and links.</p>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button key={c} onClick={() => setS({ ...s, accent_color: c })}
                className={`h-9 w-9 rounded-full border-2 transition ${s.accent_color === c ? "border-foreground scale-110" : "border-border"}`}
                style={{ background: c }} aria-label={c} />
            ))}
            <div className="flex items-center gap-2 ml-2">
              <Input type="color" value={s.accent_color} onChange={(e) => setS({ ...s, accent_color: e.target.value })}
                className="h-9 w-12 p-1 cursor-pointer" />
              <Input value={s.accent_color} onChange={(e) => setS({ ...s, accent_color: e.target.value })}
                className="h-9 w-28 font-mono text-xs uppercase" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Defaults & footer</h2>
        <div>
          <Label>Default Terms & Conditions</Label>
          <Textarea value={s.default_terms} onChange={(e) => setS({ ...s, default_terms: e.target.value })}
            placeholder="Pre-filled into every new invoice…" rows={3} />
        </div>
        <div>
          <Label>Default Notes</Label>
          <Textarea value={s.default_notes} onChange={(e) => setS({ ...s, default_notes: e.target.value })}
            placeholder="Thank-you message, payment instructions, etc." rows={2} />
        </div>
        <div>
          <Label>Footer text</Label>
          <Input value={s.footer_text} onChange={(e) => setS({ ...s, footer_text: e.target.value })} />
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Signature</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Show signature line</div>
            <div className="text-xs text-muted-foreground">Adds a signature box at the bottom right.</div>
          </div>
          <Switch checked={s.show_signature} onCheckedChange={(v) => setS({ ...s, show_signature: v })} />
        </div>
        <div>
          <Label>Signature label</Label>
          <Input value={s.signature_label} onChange={(e) => setS({ ...s, signature_label: e.target.value })}
            disabled={!s.show_signature} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Show amount in words</div>
            <div className="text-xs text-muted-foreground">e.g. "Eleven Thousand Two Hundred Ten Rupees Only".</div>
          </div>
          <Switch checked={s.show_amount_in_words} onCheckedChange={(v) => setS({ ...s, show_amount_in_words: v })} />
        </div>
      </Card>
    </div>
  );
}

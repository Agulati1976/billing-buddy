import { Card } from "@/components/ui/card";
import { useBusiness } from "@/hooks/useBusiness";

export default function Settings() {
  const { current } = useBusiness();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Current business</h2>
        <dl className="text-sm grid grid-cols-3 gap-y-2">
          <dt className="text-muted-foreground">Name</dt><dd className="col-span-2">{current?.name}</dd>
          <dt className="text-muted-foreground">GSTIN</dt><dd className="col-span-2 font-mono">{current?.gstin || "—"}</dd>
          <dt className="text-muted-foreground">State</dt><dd className="col-span-2">{current?.state_code ? `${current.state_code} · ${current.state}` : "—"}</dd>
          <dt className="text-muted-foreground">Phone</dt><dd className="col-span-2">{current?.phone || "—"}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="col-span-2">{current?.email || "—"}</dd>
          <dt className="text-muted-foreground">Address</dt><dd className="col-span-2 whitespace-pre-line">{current?.address || "—"}</dd>
        </dl>
        <p className="text-xs text-muted-foreground pt-2">Editing business details, team management, and roles coming next.</p>
      </Card>
    </div>
  );
}

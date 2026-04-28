import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Palette, Settings as SettingsIcon, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useBusiness } from "@/hooks/useBusiness";
import { usePermissions } from "@/hooks/usePermissions";

export default function Settings() {
  const { current } = useBusiness();
  const { role } = usePermissions();

  const tiles = [
    { to: "/settings/team",    icon: Users,   title: "Team & Permissions",
      desc: "Invite teammates and set their access level." },
    { to: "/settings/invoice", icon: Palette, title: "Invoice Design",
      desc: "Pick a template, accent colour, footer text and defaults." },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground">Manage your business profile, team and invoice appearance.</p>
      </div>

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Current business</h2>
          {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
        </div>
        <dl className="text-sm grid grid-cols-3 gap-y-2">
          <dt className="text-muted-foreground">Name</dt><dd className="col-span-2">{current?.name}</dd>
          <dt className="text-muted-foreground">GSTIN</dt><dd className="col-span-2 font-mono">{current?.gstin || "—"}</dd>
          <dt className="text-muted-foreground">State</dt><dd className="col-span-2">{current?.state_code ? `${current.state_code} · ${current.state}` : "—"}</dd>
          <dt className="text-muted-foreground">Phone</dt><dd className="col-span-2">{current?.phone || "—"}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="col-span-2">{current?.email || "—"}</dd>
          <dt className="text-muted-foreground">Address</dt><dd className="col-span-2 whitespace-pre-line">{current?.address || "—"}</dd>
        </dl>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to}>
            <Card className="p-5 hover:border-primary/40 transition cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold flex items-center justify-between">
                    {t.title}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

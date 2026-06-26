import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Admin = { id: string; user_id: string; created_at: string; full_name?: string | null; email?: string | null };

export default function AdminAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);


  const load = async () => {
    setLoading(true);
    const { data: pa } = await supabase.from("platform_admins").select("id, user_id, created_at").order("created_at");
    const ids = (pa ?? []).map((p) => p.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids)
      : { data: [] as any[] };
    const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    setAdmins((pa ?? []).map((p) => ({ ...p, ...(map.get(p.user_id) ?? {}) })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const promote = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-actions", {
      body: {
        action: "create_admin_user",
        metadata: {
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim() || undefined,
        },
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success("Admin added");
    setEmail(""); setPassword(""); setFullName("");
    load();
  };


  const remove = async (id: string, uid: string) => {
    if (uid === user?.id) {
      toast.error("You can't remove yourself.");
      return;
    }
    if (!confirm("Remove this admin?")) return;
    const { error } = await supabase.from("platform_admins").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); load(); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Admins</h1>
        <p className="text-sm text-muted-foreground">Anyone here can sign in via /admin/login and view all shopkeepers.</p>
      </div>

      <Card className="p-5">
        <form onSubmit={promote} className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="promote-email">Email</Label>
              <Input id="promote-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promote-name">Full name (optional)</Label>
              <Input id="promote-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promote-password">Password</Label>
              <Input id="promote-password" type="text" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password" />
            </div>
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add admin"}</Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">Creates a new auth user (or promotes an existing one) and grants platform-admin access.</p>
      </Card>


      <Card className="p-5 space-y-3">
        <h3 className="font-medium">Current admins</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admins yet.</p>
        ) : (
          admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b last:border-0 pb-2">
              <div>
                <div className="font-medium text-sm">{a.full_name ?? "—"} {a.user_id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}</div>
                <div className="text-xs text-muted-foreground">{a.email ?? a.user_id}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(a.id, a.user_id)} disabled={a.user_id === user?.id}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

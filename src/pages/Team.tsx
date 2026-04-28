import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, UserPlus, Trash2, ShieldCheck, ArrowLeft } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type Role } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  email: string | null;
  full_name: string | null;
}

const ROLE_DESC: Record<Role, string> = {
  owner: "Full access — billing, team, delete business",
  admin: "Manage everything except team & billing",
  staff: "Create invoices, payments, items. No settings, no deletes.",
};

export default function Team() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const { canManageTeam, role: myRole, loading: permsLoading } = usePermissions();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("staff");
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles").select("id,user_id,role").eq("business_id", current.id);
    if (!roles) { setMembers([]); setLoading(false); return; }
    const ids = roles.map((r) => r.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("user_id,email,full_name").in("user_id", ids)
      : { data: [] as any[] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    setMembers(roles.map((r: any) => ({
      id: r.id, user_id: r.user_id, role: r.role,
      email: profMap.get(r.user_id)?.email ?? null,
      full_name: profMap.get(r.user_id)?.full_name ?? null,
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, [current?.id]);

  const invite = async () => {
    if (!current) return;
    if (!email.trim()) { toast.error("Enter an email"); return; }
    setInviting(true);
    try {
      // Find user by email in profiles
      const { data: prof, error: pErr } = await supabase
        .from("profiles").select("user_id").eq("email", email.trim().toLowerCase()).maybeSingle();
      if (pErr) throw pErr;
      if (!prof) {
        toast.error("No registered user with that email. Ask them to sign up first.");
        return;
      }
      const { error } = await supabase.from("user_roles").insert({
        user_id: prof.user_id, business_id: current.id, role: newRole,
      });
      if (error) {
        if (error.code === "23505") toast.error("That user is already a member");
        else throw error;
        return;
      }
      toast.success("Member added");
      setEmail(""); setNewRole("staff");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setInviting(false); }
  };

  const changeRole = async (m: Member, role: Role) => {
    if (m.role === "owner") { toast.error("Cannot change owner's role"); return; }
    const { error } = await supabase.from("user_roles").update({ role }).eq("id", m.id);
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); load(); }
  };

  const remove = async (m: Member) => {
    if (m.role === "owner") { toast.error("Cannot remove the owner"); return; }
    if (m.user_id === user?.id) { toast.error("You can't remove yourself"); return; }
    if (!confirm(`Remove ${m.email ?? m.full_name ?? "this member"}?`)) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", m.id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); load(); }
  };

  if (permsLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  if (!canManageTeam) {
    return (
      <Card className="p-6 max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-5 w-5 text-warning" />
          <h2 className="font-semibold">Owner only</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Only the business owner can manage team members. Your current role: <Badge variant="secondary">{myRole ?? "none"}</Badge>
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Team & Permissions
          </h1>
          <p className="text-sm text-muted-foreground">Invite teammates and assign their access level.</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add a member</h2>
        <p className="text-xs text-muted-foreground">
          The person must already have a Lovable account on this app. Ask them to sign up first, then add them here by email.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{ROLE_DESC[newRole]}</div>
        <Button onClick={invite} disabled={inviting}>
          {inviting ? "Adding…" : "Add Member"}
        </Button>
      </Card>

      <Card>
        <div className="p-4 border-b font-medium">Members ({members.length})</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-40">Role</TableHead>
              <TableHead className="text-right w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  {m.full_name ?? "—"}
                  {m.user_id === user?.id && <Badge variant="secondary" className="ml-2">You</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                <TableCell>
                  {m.role === "owner" ? (
                    <Badge>Owner</Badge>
                  ) : (
                    <Select value={m.role} onValueChange={(v) => changeRole(m, v as Role)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {m.role !== "owner" && m.user_id !== user?.id && (
                    <Button size="icon" variant="ghost" onClick={() => remove(m)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">Role permissions</h2>
        <div className="space-y-2 text-sm">
          {(["owner", "admin", "staff"] as Role[]).map((r) => (
            <div key={r} className="flex items-start gap-3">
              <Badge variant={r === "owner" ? "default" : "secondary"} className="capitalize w-16 justify-center">{r}</Badge>
              <div className="text-muted-foreground">{ROLE_DESC[r]}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

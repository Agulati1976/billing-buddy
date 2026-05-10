import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, UserPlus, Trash2, ShieldCheck, ArrowLeft, ShoppingCart, KeyRound, SlidersHorizontal } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type Role } from "@/hooks/usePermissions";
import { usePosAccess } from "@/hooks/usePosAccess";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ALL_MODULES, DEFAULT_STAFF_MODULES, type ModuleKey } from "@/lib/modules";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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
  staff: "Limited to selected modules. Cannot delete records.",
};

export default function Team() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const { canManageTeam, role: myRole, loading: permsLoading } = usePermissions();
  const { posEnabled } = usePosAccess();
  const [members, setMembers] = useState<Member[]>([]);
  const [moduleAccess, setModuleAccess] = useState<Record<string, ModuleKey[]>>({});
  const [posUserIds, setPosUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Create staff form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newModules, setNewModules] = useState<Set<ModuleKey>>(new Set(DEFAULT_STAFF_MODULES));
  const [creating, setCreating] = useState(false);

  // Module dialog
  const [editing, setEditing] = useState<Member | null>(null);
  const [editModules, setEditModules] = useState<Set<ModuleKey>>(new Set());
  const [savingModules, setSavingModules] = useState(false);

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
    const { data: ma } = await supabase
      .from("staff_module_access").select("user_id, modules").eq("business_id", current.id);
    setModuleAccess(Object.fromEntries((ma ?? []).map((m: any) => [m.user_id, m.modules ?? []])));
    const { data: posAccess } = await supabase.from("pos_user_access").select("user_id").eq("business_id", current.id);
    setPosUserIds(new Set((posAccess ?? []).map((p: any) => p.user_id)));
    setLoading(false);
  };
  useEffect(() => { load(); }, [current?.id]);

  const togglePosAccess = async (m: Member, next: boolean) => {
    if (!current) return;
    if (next) {
      const { error } = await supabase.from("pos_user_access").insert({ business_id: current.id, user_id: m.user_id, granted_by: user?.id });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("pos_user_access").delete().eq("business_id", current.id).eq("user_id", m.user_id);
      if (error) { toast.error(error.message); return; }
    }
    setPosUserIds((prev) => {
      const next2 = new Set(prev);
      if (next) next2.add(m.user_id); else next2.delete(m.user_id);
      return next2;
    });
    toast.success(next ? "POS access granted" : "POS access removed");
  };

  const createStaff = async () => {
    if (!current) return;
    if (!email.trim() || !password.trim()) { toast.error("Email and password are required"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-staff", {
        body: {
          business_id: current.id,
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim() || null,
          modules: Array.from(newModules),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Staff login created");
      setEmail(""); setPassword(""); setFullName("");
      setNewModules(new Set(DEFAULT_STAFF_MODULES));
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed to create staff"); }
    finally { setCreating(false); }
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

  const openModuleEditor = (m: Member) => {
    setEditing(m);
    setEditModules(new Set((moduleAccess[m.user_id] ?? DEFAULT_STAFF_MODULES) as ModuleKey[]));
  };

  const saveModules = async () => {
    if (!current || !editing) return;
    setSavingModules(true);
    const { error } = await supabase.from("staff_module_access").upsert({
      business_id: current.id,
      user_id: editing.user_id,
      modules: Array.from(editModules),
    }, { onConflict: "business_id,user_id" });
    setSavingModules(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Module access updated");
    setEditing(null);
    load();
  };

  if (permsLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  if (!canManageTeam) {
    return (
      <Card className="p-4 sm:p-6 max-w-xl">
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

  const groupedModules = ALL_MODULES.reduce((acc, m) => {
    (acc[m.group] ||= []).push(m); return acc;
  }, {} as Record<string, typeof ALL_MODULES>);

  const renderModuleGrid = (selected: Set<ModuleKey>, onToggle: (k: ModuleKey, v: boolean) => void) => (
    <div className="space-y-3">
      {Object.entries(groupedModules).map(([group, mods]) => (
        <div key={group}>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">{group}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {mods.map((m) => (
              <label key={m.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <span>{m.label}</span>
                <Switch checked={selected.has(m.key)} onCheckedChange={(v) => onToggle(m.key, v)} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Team & Permissions
          </h1>
          <p className="text-sm text-muted-foreground">Create staff logins and choose which modules they can access.</p>
        </div>
      </div>

      <Card className="p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4" /> Create staff login</h2>
        <p className="text-xs text-muted-foreground">
          You set the email and password — share them with your staff. They'll only see the modules you turn on below.
          Staff cannot delete any records.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ravi Kumar" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@shop.com" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm">Modules this staff can access</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline"
                onClick={() => setNewModules(new Set(ALL_MODULES.map((m) => m.key)))}>
                Select all
              </Button>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setNewModules(new Set())}>
                Clear
              </Button>
            </div>
          </div>
          {renderModuleGrid(newModules, (k, v) => {
            setNewModules((prev) => {
              const n = new Set(prev);
              if (v) n.add(k); else n.delete(k);
              return n;
            });
          })}
        </div>

        <Button onClick={createStaff} disabled={creating}>
          <KeyRound className="h-4 w-4 mr-2" />
          {creating ? "Creating…" : "Create Staff Login"}
        </Button>
      </Card>

      <Card>
        <div className="p-4 border-b font-medium">Members ({members.length})</div>

        {/* Mobile cards */}
        <div className="sm:hidden p-3 space-y-2">
          {loading ? (
            <div className="text-center py-6 text-sm text-muted-foreground">Loading…</div>
          ) : members.map((m) => {
            const mods = moduleAccess[m.user_id] ?? [];
            return (
              <Card key={m.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {m.full_name ?? "—"}
                      {m.user_id === user?.id && <Badge variant="secondary" className="ml-1.5 text-[10px]">You</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{m.email ?? "—"}</div>
                  </div>
                  {m.role !== "owner" && m.user_id !== user?.id && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(m)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {m.role === "owner" ? (
                    <Badge>Owner</Badge>
                  ) : (
                    <Select value={m.role} onValueChange={(v) => changeRole(m, v as Role)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {m.role === "staff" ? (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => openModuleEditor(m)}>
                      <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                      {mods.length} modules
                    </Button>
                  ) : m.role !== "owner" && (
                    <Badge variant="secondary">All modules</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-40">Role</TableHead>
                <TableHead className="w-32">Modules</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : members.map((m) => {
                const mods = moduleAccess[m.user_id] ?? [];
                return (
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
                    <TableCell>
                      {m.role === "staff" ? (
                        <Button size="sm" variant="outline" onClick={() => openModuleEditor(m)}>
                          <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                          {mods.length} on
                        </Button>
                      ) : (
                        <Badge variant="secondary">All</Badge>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> POS Access
          </h2>
          {!posEnabled && <Badge variant="outline">POS not enabled</Badge>}
        </div>
        {!posEnabled ? (
          <p className="text-sm text-muted-foreground">
            Point of Sale is not enabled for this business yet. Contact the platform admin to enable POS, then you'll be able to grant access to specific staff here.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Owners and Admins can use POS by default. Toggle access on for staff who should be able to ring up sales at the till.
            </p>
            <div className="space-y-2">
              {members.map((m) => {
                const implicit = m.role === "owner" || m.role === "admin";
                const checked = implicit || posUserIds.has(m.user_id);
                return (
                  <div key={m.id} className="flex items-center justify-between border-b last:border-0 pb-2">
                    <div className="text-sm">
                      <div className="font-medium">{m.full_name ?? m.email ?? "—"} {implicit && <Badge variant="secondary" className="ml-1 text-[10px]">auto · {m.role}</Badge>}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </div>
                    <Switch
                      checked={checked}
                      disabled={implicit}
                      onCheckedChange={(v) => togglePosAccess(m, v)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Module access — {editing?.full_name ?? editing?.email}</DialogTitle>
            <DialogDescription>Choose which sections of the app this staff member can see.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mb-2">
            <Button type="button" size="sm" variant="outline"
              onClick={() => setEditModules(new Set(ALL_MODULES.map((m) => m.key)))}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditModules(new Set())}>
              Clear
            </Button>
          </div>
          {renderModuleGrid(editModules, (k, v) => {
            setEditModules((prev) => {
              const n = new Set(prev);
              if (v) n.add(k); else n.delete(k);
              return n;
            });
          })}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveModules} disabled={savingModules}>{savingModules ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

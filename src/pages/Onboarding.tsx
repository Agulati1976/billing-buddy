import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { INDIAN_STATES } from "@/lib/states";
import { Building2, Sparkles } from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh, businesses } = useBusiness();
  const FREE_LIMIT = 2;
  const ownedCount = businesses.filter((b) => b.owner_id === user?.id).length;
  const isPremium = typeof window !== "undefined" && localStorage.getItem("is_premium") === "1";
  const blocked = ownedCount >= FREE_LIMIT && !isPremium;

  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [pincode, setPincode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (blocked) {
      toast.error("Free plan allows up to 2 businesses. Upgrade to premium to add more.");
      return;
    }
    if (pincode && !/^\d{6}$/.test(pincode)) {
      toast.error("Pincode must be 6 digits");
      return;
    }
    setBusy(true);
    const stateName = INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? null;
    const { error } = await supabase.from("businesses").insert({
      name, gstin: gstin || null, phone: phone || null, email: email || null,
      address: address || null, state: stateName, state_code: stateCode || null,
      pincode: pincode || null,
      owner_id: user.id,
    } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Business created!");
    await refresh();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-lg bg-primary-soft flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Create your business</h1>
            <p className="text-sm text-muted-foreground">You can change these details anytime.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bn">Business name *</Label>
            <Input id="bn" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Traders" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="g">GSTIN</Label>
              <Input id="g" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ph">Phone</Label>
              <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="em">Email</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="st">State</Label>
              <Select value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">Pincode *</Label>
              <Input id="pin" inputMode="numeric" maxLength={6} value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="110001" required />
              <p className="text-xs text-muted-foreground">Used in your invoice numbers (e.g. <span className="font-mono">110001/001/090526</span>).</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ad">Business address</Label>
            <Textarea id="ad" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
          </div>

          <Button type="submit" className="w-full" disabled={busy || !name}>
            {busy ? "Creating…" : "Create business & continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

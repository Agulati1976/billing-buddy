import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ResetPassword(){
  const {user,loading}=useAuth();
  const navigate=useNavigate();
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(busy)return;
    if(password.length<8){toast.error("Use at least 8 characters");return;}
    if(password!==confirmation){toast.error("Passwords do not match");return;}
    setBusy(true);
    const {error}=await supabase.auth.updateUser({password});
    setBusy(false);
    if(error){toast.error(error.message);return;}
    toast.success("Password updated");navigate("/",{replace:true});
  };
  return <main className="min-h-screen flex items-center justify-center p-4 bg-muted/20"><Card className="w-full max-w-md p-6 space-y-4"><h1 className="text-xl font-semibold">Set a new password</h1>{loading?<p>Checking your recovery link…</p>:!user?<p>Your recovery link is missing or has expired. <Link to="/auth" className="text-primary underline">Request another link</Link>.</p>:<form onSubmit={submit} className="space-y-4"><div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></div><div><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></div><Button type="submit" disabled={busy}>{busy?"Updating…":"Update password"}</Button></form>}</Card></main>;
}

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, User, ShieldCheck, Loader2 } from "lucide-react";
import logoAsset from "@/assets/billlook-logo.png.asset.json";



export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [showPwd, setShowPwd] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");

  // Signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPwd });
    setBusy(false);
    if (error) toast.error(error.message);
    else navigate("/", { replace: true });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pwd,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: name },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Account created! You're signed in.");
      navigate("/", { replace: true });
    }
  };

  const handleForgot = async () => {
    if (!loginEmail.trim()) {
      toast.error("Enter your email above first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent to your email");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Hero */}
      <div
        className="relative pt-[max(env(safe-area-inset-top),2.5rem)] pb-20 px-6 text-primary-foreground overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 60%, hsl(var(--primary) / 0.7) 100%)",
        }}
      >
        <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-col items-center text-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-lg">
            <Receipt className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Bill Look</h1>
          <p className="text-sm opacity-90">GST billing & inventory for Indian businesses</p>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 -mt-6 px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div className="mx-auto w-full max-w-md bg-card rounded-2xl shadow-xl border p-6 sm:p-7">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
            <TabsList className="grid grid-cols-2 w-full mb-5 h-11 rounded-xl">
              <TabsTrigger value="login" className="rounded-lg">Login</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-lg">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-0">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="le">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="le"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      placeholder="you@example.com"
                      className="pl-9 h-11"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="lp">Password</Label>
                    <button
                      type="button"
                      onClick={handleForgot}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lp"
                      type={showPwd ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      className="pl-9 pr-10 h-11"
                      value={loginPwd}
                      onChange={(e) => setLoginPwd(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-base font-semibold rounded-xl" disabled={busy}>
                  {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</> : "Login"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-0">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="n">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="n" required autoComplete="name" placeholder="Your name" className="pl-9 h-11" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="e" type="email" inputMode="email" autoComplete="email" required placeholder="you@example.com" className="pl-9 h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="p"
                      type={showPwd ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      className="pl-9 pr-10 h-11"
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-base font-semibold rounded-xl" disabled={busy}>
                  {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating account…</> : "Create account"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                  By creating an account you agree to our Terms &{" "}
                  <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <div className="mx-auto w-full max-w-md mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Secure login · End-to-end encrypted</span>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-3">
          Platform admin? <Link to="/admin/login" className="text-primary hover:underline">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}

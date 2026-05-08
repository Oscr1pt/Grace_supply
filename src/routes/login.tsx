import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gem } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@lustre.co");
  const [password, setPassword] = useState("demo1234");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name || email.split("@")[0]);
      toast.success(mode === "login" ? "Welcome back" : "Account created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--gold) 0%, transparent 40%), radial-gradient(circle at 80% 70%, var(--gold) 0%, transparent 35%)",
          }}
        />
        <div className="relative flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2">
            <Gem className="h-7 w-7 text-sidebar-primary" />
            <span className="font-display text-3xl text-sidebar-primary">Lustre</span>
          </div>
          <div>
            <h2 className="font-display text-5xl leading-tight">
              Every gem tells<br />a story.
            </h2>
            <p className="mt-4 text-sidebar-foreground/70 max-w-sm">
              The complete sales, inventory and client suite — designed for fine jewelers who care about every carat.
            </p>
          </div>
          <p className="text-xs text-sidebar-foreground/50">© Lustre Jewelry Suite</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Gem className="h-6 w-6 text-primary" />
            <span className="font-display text-2xl">Lustre</span>
          </div>
          <h1 className="text-3xl font-display">{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Welcome back to your boutique." : "Set up your jeweler workspace."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="mt-6 text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>

          {mode === "login" && (
            <p className="mt-6 text-xs text-muted-foreground border-t border-border pt-4">
              Demo account preloaded: <span className="font-mono">demo@lustre.co</span> / <span className="font-mono">demo1234</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
      toast.success("Bienvenido de nuevo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Algo salió mal");
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
            <span className="font-display text-3xl text-sidebar-primary">IMPERIO GOLD</span>
          </div>
          <div>
            <h2 className="font-display text-5xl leading-tight">
              Cada gema cuenta<br />una historia.
            </h2>
            <p className="mt-4 text-sidebar-foreground/70 max-w-sm">
              La suite completa de ventas, inventario y clientes — diseñada para joyeros que cuidan cada quilate.
            </p>
          </div>
          <p className="text-xs text-sidebar-foreground/50">© IMPERIO GOLD Joyería · Santo Domingo, RD</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Gem className="h-6 w-6 text-primary" />
            <span className="font-display text-2xl">IMPERIO GOLD</span>
          </div>
          <h1 className="text-3xl font-display">Iniciar sesión</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bienvenido de vuelta a tu boutique.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Espera…" : "Entrar"}
            </Button>
          </form>


        </div>
      </div>
    </div>
  );
}

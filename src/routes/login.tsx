import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import graceLogo from "@/assets/grace-logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const accountRecoveryEnabled = import.meta.env.VITE_ACCOUNT_RECOVERY_ENABLED === "true";

function LoginPage() {
  const { user, authReady, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Ingresa tu usuario y contraseña.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      toast.success("Bienvenido de nuevo a Grace Supply");
    } catch (err) {
      setPassword("");
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#050505] text-[#F5F5F5]">
      {/* Brand Presentation Side */}
      <div className="hidden lg:flex relative overflow-hidden bg-[#000000] border-r border-[#262626] text-foreground">
        {/* Subtle radial ambient light with gold accent */}
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 30%, #D4AF37 0%, transparent 55%), radial-gradient(circle at 70% 80%, #D4AF37 0%, transparent 50%)",
          }}
        />
        <div className="relative flex flex-col justify-between p-14 w-full z-10">
          <div className="flex items-center gap-3">
            <img
              src={graceLogo}
              alt="GRACE SUPPLY"
              className="h-16 w-16 object-contain rounded-full border border-[#D4AF37]/40 shadow-lg shadow-[#D4AF37]/10"
            />
            <div>
              <span className="font-display text-2xl font-bold tracking-wider text-[#F5F5F5] block">
                GRACE SUPPLY
              </span>
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] font-medium block">
                BARBERÍA & BELLEZA
              </span>
            </div>
          </div>

          <div className="my-auto py-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-medium mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Estilo, Elegancia & Calidad Premium</span>
            </div>
            <h2 className="font-display text-5xl leading-tight text-[#FFFFFF] tracking-tight">
              Excelencia y estilo<br />
              <span className="text-[#D4AF37]">en cada detalle.</span>
            </h2>
            <p className="mt-5 text-neutral-400 text-base max-w-md leading-relaxed">
              La suite completa de gestión de ventas, inventario y clientes — diseñada para profesionales de barbería, estética y cuidado personal.
            </p>
          </div>

          <div className="pt-6 border-t border-[#1C1C1C] flex items-center justify-between text-xs text-neutral-500">
            <span>© GRACE SUPPLY · Todos los derechos reservados</span>
            <div className="flex items-center gap-1 text-[#D4AF37]">
              <ShieldCheck className="h-4 w-4" />
              <span>Sistema Oficial</span>
            </div>
          </div>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex items-center justify-center p-8 bg-[#050505]">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center lg:text-left space-y-3">
            <div className="flex justify-center lg:justify-start mb-4">
              <img
                src={graceLogo}
                alt="GRACE SUPPLY"
                className="h-20 w-20 object-contain rounded-full border border-[#D4AF37]/50 shadow-xl shadow-[#D4AF37]/15"
              />
            </div>
            <h1 className="text-3xl font-display font-semibold tracking-tight text-[#FFFFFF]">
              Iniciar sesión
            </h1>
            <p className="text-sm text-neutral-400">
              Ingresa tus credenciales para acceder al panel de control de <span className="text-[#D4AF37] font-medium">GRACE SUPPLY</span>.
            </p>
          </div>

          <form onSubmit={submit} noValidate className="space-y-5">
            {error && <div id="login-error" role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs uppercase tracking-wider text-neutral-300 font-medium">
                Usuario
              </Label>
              <Input
                id="username"
                type="text"
                required
                autoComplete="username"
                placeholder="Ingresa tu usuario"
                value={username}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-[#121212] border-[#262626] text-[#F5F5F5] placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-[#D4AF37]/20 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-neutral-300 font-medium">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#121212] border-[#262626] text-[#F5F5F5] placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-[#D4AF37]/20 h-11"
              />
            </div>

            <Button
              type="submit"
              disabled={busy || !authReady}
              className="w-full h-11 bg-[#D4AF37] text-[#050505] hover:bg-[#E5C158] font-semibold text-sm transition-all duration-200 shadow-md shadow-[#D4AF37]/20 border-0"
            >
              {busy ? "Verificando…" : !authReady ? "Verificando sesión…" : "Entrar al sistema"}
            </Button>
          </form>

          {accountRecoveryEnabled ? (
            <Link to="/recover" className="block text-center text-sm text-[#D4AF37] underline-offset-4 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          ) : (
            <p role="note" className="text-center text-xs text-neutral-500">La recuperacion se habilitara tras verificar el correo transaccional y las URL de este entorno.</p>
          )}

          <p className="text-center text-xs text-neutral-600 pt-4">
            GRACE SUPPLY · Productos de Barbería & Belleza
          </p>
        </div>
      </div>
    </div>
  );
}

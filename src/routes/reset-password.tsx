import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

const accountRecoveryEnabled = import.meta.env.VITE_ACCOUNT_RECOVERY_ENABLED === "true";

function ResetPasswordPage() {
  const { passwordSetupStatus, passwordSetupError, completePasswordSetup } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordSetupStatus !== "ready" || busy) return;
    if (password.length < 12) {
      setMessage("La contraseña debe tener al menos 12 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPassword("");
      setConfirmation("");
      setMessage("No se pudo guardar la contraseña. El enlace pudo vencer o utilizarse; solicita uno nuevo.");
    } else {
      setPassword("");
      setConfirmation("");
      completePasswordSetup();
      await supabase.auth.signOut({ scope: "local" });
    }
    setBusy(false);
  };

  const showRecoveryLink = accountRecoveryEnabled;

  return (
    <main className="min-h-screen grid place-items-center bg-[#050505] px-4 text-[#F5F5F5]">
      <section className="w-full max-w-sm space-y-6 rounded-xl border border-[#262626] bg-[#101010] p-7">
        <div>
          <h1 className="font-display text-2xl">Establece tu contraseña</h1>
          <p className="mt-2 text-sm text-neutral-400">Supabase Auth debe verificar una invitación o un enlace de recuperación vigente.</p>
        </div>
        {passwordSetupStatus === "complete" ? (
          <p role="status" className="text-sm text-neutral-300">
            La contraseña quedó guardada en Supabase Auth. Esto no activa tu perfil ni concede permisos; vuelve al inicio de sesión después de que el administrador habilite tu cuenta.
          </p>
        ) : passwordSetupStatus === "pending" ? (
          <p role="status" className="text-sm text-neutral-400">Verificando el enlace seguro…</p>
        ) : passwordSetupStatus === "ready" ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Contraseña nueva</Label>
              <Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
            </div>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <Button type="submit" disabled={busy} className="w-full bg-[#D4AF37] text-black hover:bg-[#E5C158]">
              {busy ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-neutral-300">
              {passwordSetupError ?? "No hay una sesión Auth válida para este enlace."} Un enlace usado, vencido o abierto en otro navegador debe reemplazarse por uno nuevo.
            </p>
            {showRecoveryLink ? (
              <Link to="/recover" className="block text-sm text-[#D4AF37] underline-offset-4 hover:underline">Solicitar recuperación de contraseña</Link>
            ) : (
              <p className="text-sm text-neutral-400">La recuperación automática está deshabilitada. Solicita al propietario que envíe un enlace de recuperación para la identidad existente desde Supabase Auth; no crees otra cuenta.</p>
            )}
          </div>
        )}
        <Link to="/login" className="block text-sm text-[#D4AF37] underline-offset-4 hover:underline">Volver al inicio de sesión</Link>
      </section>
    </main>
  );
}

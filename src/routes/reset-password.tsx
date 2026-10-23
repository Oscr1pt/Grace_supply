import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

const accountRecoveryEnabled = import.meta.env.VITE_ACCOUNT_RECOVERY_ENABLED === "true";

function ResetPasswordPage() {
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setHasSession(!error && Boolean(data.session));
      setCheckingSession(false);
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountRecoveryEnabled || !hasSession || busy) return;
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
      setMessage("El enlace venció o no pudo actualizarse. Solicita uno nuevo.");
    } else {
      setPassword("");
      setConfirmation("");
      await supabase.auth.signOut({ scope: "local" });
      setHasSession(false);
      setComplete(true);
    }
    setBusy(false);
  };

  return (
    <main className="min-h-screen grid place-items-center bg-[#050505] px-4 text-[#F5F5F5]">
      <section className="w-full max-w-sm space-y-6 rounded-xl border border-[#262626] bg-[#101010] p-7">
        <div>
          <h1 className="font-display text-2xl">Crear contraseña nueva</h1>
          <p className="mt-2 text-sm text-neutral-400">El enlace de Supabase Auth debe estar vigente y abrirse en esta sesión.</p>
        </div>
        {!accountRecoveryEnabled ? (
          <p role="status" className="text-sm text-neutral-300">La recuperacion no esta habilitada hasta verificar el correo transaccional y las URL del entorno.</p>
        ) : complete ? (
          <p role="status" className="text-sm text-neutral-300">La contraseña se actualizó. Inicia sesión con tu nombre de usuario.</p>
        ) : checkingSession ? (
          <p role="status" className="text-sm text-neutral-400">Verificando el enlace…</p>
        ) : hasSession ? (
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
            <Button type="submit" disabled={busy} className="w-full bg-[#D4AF37] text-black hover:bg-[#E5C158]">{busy ? "Actualizando…" : "Actualizar contraseña"}</Button>
          </form>
        ) : (
          <p role="alert" className="text-sm text-neutral-300">El enlace no es válido o venció. Solicita otro desde inicio de sesión.</p>
        )}
        <Link to="/login" className="block text-sm text-[#D4AF37] underline-offset-4 hover:underline">Volver al inicio de sesión</Link>
      </section>
    </main>
  );
}

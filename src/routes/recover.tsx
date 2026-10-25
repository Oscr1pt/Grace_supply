import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/recover")({ component: RecoverPage });

const accountRecoveryEnabled = import.meta.env.VITE_ACCOUNT_RECOVERY_ENABLED === "true";
const genericMessage = "Si la cuenta estÃ¡ habilitada y tiene un correo individual verificado, recibirÃ¡ instrucciones.";

function RecoverPage() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountRecoveryEnabled || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.functions.invoke("username-recovery", { body: { username } });
      if (error) throw error;
      setMessage(genericMessage);
    } catch {
      setMessage("No se pudo procesar la solicitud. Intenta mÃ¡s tarde.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-[#050505] px-4 text-[#F5F5F5]">
      <section className="w-full max-w-sm space-y-6 rounded-xl border border-[#262626] bg-[#101010] p-7">
        <div>
          <h1 className="font-display text-2xl">Recuperar acceso</h1>
          <p className="mt-2 text-sm text-neutral-400">Ingresa tu nombre de usuario. No solicitaremos ni mostraremos tu correo.</p>
        </div>
        {accountRecoveryEnabled ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-username">Usuario</Label>
              <Input id="recovery-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
            {message && <p role="status" aria-live="polite" className="text-sm text-neutral-300">{message}</p>}
            <Button type="submit" disabled={busy || !username.trim()} className="w-full bg-[#D4AF37] text-black hover:bg-[#E5C158]">
              {busy ? "Procesando…" : "Enviar instrucciones"}
            </Button>
          </form>
        ) : (
          <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-neutral-300">
            La recuperacion se habilitara tras verificar el correo transaccional y las URL del entorno. Cada cuenta habilitada requiere un correo individual verificado.
          </p>
        )}
        <Link to="/login" className="block text-sm text-[#D4AF37] underline-offset-4 hover:underline">Volver al inicio de sesión</Link>
      </section>
    </main>
  );
}

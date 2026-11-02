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
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordSetupStatus !== "ready" || busy) return;
    const nextErrors: typeof fieldErrors = {};
    if (password.length < 12)
      nextErrors.password = "La contraseña debe tener al menos 12 caracteres.";
    if (password !== confirmation) nextErrors.confirmation = "Las contraseñas no coinciden.";
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      document.getElementById(nextErrors.password ? "new-password" : "confirm-password")?.focus();
      return;
    }

    setBusy(true);
    setRequestError(null);
    setFieldErrors({});
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setRequestError(
          "No se pudo guardar la contraseña. El enlace pudo vencer o utilizarse; solicita uno nuevo.",
        );
        return;
      }
      setPassword("");
      setConfirmation("");
      completePasswordSetup();
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        setRequestError(
          "La contraseña quedó guardada, pero esta sesión temporal no se cerró. Cierra esta pestaña antes de continuar.",
        );
      }
    } catch {
      setPassword("");
      setConfirmation("");
      setRequestError(
        "No se pudo confirmar el cambio. El enlace pudo vencer o utilizarse; solicita uno nuevo.",
      );
    } finally {
      setBusy(false);
    }
  };

  const showRecoveryLink = accountRecoveryEnabled;

  return (
    <main className="min-h-screen grid place-items-center bg-[#050505] px-4 text-[#F5F5F5]">
      <section className="w-full max-w-sm space-y-6 rounded-xl border border-[#262626] bg-[#101010] p-7">
        <div>
          <h1 className="font-display text-2xl">Establece tu contraseña</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Supabase Auth debe verificar una invitación o un enlace de recuperación vigente.
          </p>
        </div>
        {passwordSetupStatus === "complete" ? (
          <div className="space-y-3">
            <p role="status" className="text-sm text-neutral-300">
              La contraseña quedó guardada en Supabase Auth. Esto no activa tu perfil ni concede
              permisos; vuelve al inicio de sesión después de que el administrador habilite tu
              cuenta.
            </p>
            {requestError && (
              <p role="alert" className="text-sm text-destructive">
                {requestError}
              </p>
            )}
          </div>
        ) : passwordSetupStatus === "pending" ? (
          <p role="status" aria-live="polite" className="text-sm text-neutral-400">
            Verificando el enlace seguro…
          </p>
        ) : passwordSetupStatus === "ready" ? (
          <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Contraseña nueva</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={password}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "new-password-error" : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                required
              />
              {fieldErrors.password && (
                <p id="new-password-error" role="alert" className="text-sm text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={confirmation}
                aria-invalid={Boolean(fieldErrors.confirmation)}
                aria-describedby={fieldErrors.confirmation ? "confirm-password-error" : undefined}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setFieldErrors((current) => ({ ...current, confirmation: undefined }));
                }}
                required
              />
              {fieldErrors.confirmation && (
                <p id="confirm-password-error" role="alert" className="text-sm text-destructive">
                  {fieldErrors.confirmation}
                </p>
              )}
            </div>
            {requestError && (
              <p role="alert" className="text-sm text-destructive">
                {requestError}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-[#D4AF37] text-black hover:bg-[#E5C158]"
            >
              {busy ? "Guardando…" : "Guardar contraseña"}
            </Button>
            {busy && (
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                Guardando la contraseña…
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-neutral-300">
              {passwordSetupError ?? "No hay una sesión Auth válida para este enlace."} Un enlace
              usado, vencido o abierto en otro navegador debe reemplazarse por uno nuevo.
            </p>
            {showRecoveryLink ? (
              <Link
                to="/recover"
                className="block text-sm text-[#D4AF37] underline-offset-4 hover:underline"
              >
                Solicitar recuperación de contraseña
              </Link>
            ) : (
              <p className="text-sm text-neutral-400">
                La recuperación automática está deshabilitada. Solicita al propietario que envíe un
                enlace de recuperación para la identidad existente desde Supabase Auth; no crees
                otra cuenta.
              </p>
            )}
          </div>
        )}
        <Link
          to="/login"
          className="block text-sm text-[#D4AF37] underline-offset-4 hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </section>
    </main>
  );
}

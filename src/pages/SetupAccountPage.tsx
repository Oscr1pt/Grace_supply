import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetupAccountPage() {
  const { passwordSetupStatus, passwordSetupError, completePasswordSetup, cancelPasswordSetup } =
    useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);

  const returnToLogin = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (busy || returning) return;
    setReturning(true);
    setReturnError(null);
    try {
      await cancelPasswordSetup();
      window.location.assign("/login");
    } catch {
      setReturnError("No se pudo cerrar la sesión temporal. Intenta de nuevo.");
      setReturning(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || passwordSetupStatus !== "ready") return;
    const nextErrors: typeof errors = {};
    if (password.length < 12)
      nextErrors.password = "La contraseña debe tener al menos 12 caracteres.";
    if (password !== confirmation) nextErrors.confirmation = "Las contraseñas no coinciden.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      document
        .getElementById(nextErrors.password ? "setup-password" : "setup-confirm-password")
        ?.focus();
      return;
    }

    setBusy(true);
    setRequestError(null);
    setErrors({});
    try {
      const { data, error } = await supabase.functions.invoke<{ completed: boolean }>(
        "complete-initial-password",
        { body: { password } },
      );
      if (error || data?.completed !== true) {
        setRequestError(
          "No se pudo confirmar el cambio de contraseña. Puedes reintentar; el servidor concilia de forma segura el resultado anterior.",
        );
        return;
      }
      setPassword("");
      setConfirmation("");
      completePasswordSetup();
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        setRequestError(
          "La contraseña quedó guardada. Esta sesión temporal no se cerró; vuelve al login y cierra esta pestaña antes de continuar.",
        );
      }
    } catch {
      setRequestError(
        "No se pudo confirmar el cambio de contraseña. Puedes reintentar para conciliar el resultado.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#050505] px-4 py-8 text-[#F5F5F5]">
      <section className="w-full max-w-md space-y-6 rounded-xl border border-[#262626] bg-[#101010] p-5 sm:p-7">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
            Alta de usuario
          </p>
          <h1 className="font-display text-2xl">Configura tu cuenta</h1>
          <p className="text-sm text-neutral-400">
            Este enlace de invitación confirma tu correo. El servidor exige que reemplaces la
            contraseña inicial antes de que un administrador pueda activar tu acceso.
          </p>
        </header>

        {passwordSetupStatus === "pending" ? (
          <p role="status" aria-live="polite" className="text-sm text-neutral-300">
            Verificando el enlace de invitación…
          </p>
        ) : passwordSetupStatus === "ready" ? (
          <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-password">Contraseña personal nueva</Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={password}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "setup-password-error" : "setup-password-hint"}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: undefined }));
                }}
                required
              />
              <p id="setup-password-hint" className="text-xs text-neutral-400">
                Al menos 12 caracteres. No se guarda en el perfil ni en el navegador.
              </p>
              {errors.password && (
                <p id="setup-password-error" role="alert" className="text-sm text-destructive">
                  {errors.password}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm-password">Confirmar contraseña</Label>
              <Input
                id="setup-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={confirmation}
                aria-invalid={Boolean(errors.confirmation)}
                aria-describedby={errors.confirmation ? "setup-confirm-error" : undefined}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setErrors((current) => ({ ...current, confirmation: undefined }));
                }}
                required
              />
              {errors.confirmation && (
                <p id="setup-confirm-error" role="alert" className="text-sm text-destructive">
                  {errors.confirmation}
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
              {busy ? "Guardando…" : "Guardar contraseña personal"}
            </Button>
            {busy && (
              <p role="status" aria-live="polite" className="text-sm text-neutral-400">
                El servidor está confirmando la configuración…
              </p>
            )}
          </form>
        ) : passwordSetupStatus === "complete" ? (
          <div className="space-y-3">
            <p role="status" className="text-sm text-neutral-300">
              La contraseña personal quedó guardada en Auth. El perfil sigue inactivo hasta que un
              administrador confirme la activación.
            </p>
            {requestError && (
              <p role="alert" className="text-sm text-destructive">
                {requestError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-neutral-300">
              {passwordSetupError ??
                "Abre el enlace de invitación vigente que recibiste por correo."}{" "}
              Un enlace vencido o utilizado debe volver a emitirse por un administrador.
            </p>
            {requestError && (
              <p role="alert" className="text-sm text-destructive">
                {requestError}
              </p>
            )}
          </div>
        )}

        {returnError && (
          <p role="alert" className="text-sm text-destructive">
            {returnError}
          </p>
        )}
        {returning && (
          <p role="status" aria-live="polite" className="text-sm text-neutral-400">
            Cerrando la sesión temporal…
          </p>
        )}
        <Link
          to="/login"
          onClick={returnToLogin}
          aria-disabled={busy || returning}
          className="block text-sm text-[#D4AF37] underline-offset-4 hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </section>
    </main>
  );
}

import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useAuth, type Role } from "@/lib/auth";
import { validateEmployeeCreation } from "@/lib/employeeManagement.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const provisioningEnabled = import.meta.env.VITE_ACCOUNT_PROVISIONING_ENABLED === "true";

type CreationForm = {
  username: string;
  name: string;
  phone: string;
  email: string;
  role: Role;
  initialPassword: string;
  confirmPassword: string;
};

const emptyForm: CreationForm = {
  username: "",
  name: "",
  phone: "",
  email: "",
  role: "employee",
  initialPassword: "",
  confirmPassword: "",
};

export function TeamCreateUserPage() {
  const { authReady, isAdmin, createEmployee } = useAuth();
  const requestLock = useRef(false);
  const [form, setForm] = useState<CreationForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CreationForm, string>>>({});
  const [busy, setBusy] = useState(false);
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update = <K extends keyof CreationForm>(field: K, value: CreationForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(null);
    setSuccess(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || requestLock.current || !provisioningEnabled) return;
    const nextErrors = validateEmployeeCreation(form);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0] as keyof CreationForm | undefined;
    if (firstInvalid) {
      document.getElementById(`new-user-${firstInvalid}`)?.focus();
      return;
    }
    if (form.role === "admin") {
      setConfirmAdmin(true);
      return;
    }
    void create(false);
  };

  const create = async (confirmAdminCreation: boolean) => {
    if (busy || requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    setRequestError(null);
    try {
      await createEmployee({
        username: form.username.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        initialPassword: form.initialPassword,
        confirmAdminCreation,
      });
      setForm(emptyForm);
      setErrors({});
      setSuccess(true);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar el alta. Verifica el listado antes de repetir.",
      );
    } finally {
      requestLock.current = false;
      setBusy(false);
      setConfirmAdmin(false);
    }
  };

  if (!authReady) {
    return (
      <p role="status" aria-live="polite">
        Verificando permisos administrativos…
      </p>
    );
  }
  if (!isAdmin) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-5"
      >
        <h1 className="font-display text-2xl">Acceso restringido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Solo un administrador activo puede crear cuentas.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <Link to="/team" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Volver a empleados
        </Link>
        <h1 className="font-display text-3xl">Crear usuario</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          La cuenta queda inactiva. La persona debe confirmar su correo y reemplazar la contraseña
          inicial antes de que un administrador pueda activar el acceso.
        </p>
      </header>

      {!provisioningEnabled ? (
        <div
          role="note"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          La creación de cuentas está deshabilitada en este entorno. No hay registro público.
        </div>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          aria-busy={busy}
          className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:p-6 md:grid-cols-2"
        >
          <Field
            id="username"
            label="Usuario"
            value={form.username}
            error={errors.username}
            onChange={(value) => update("username", value)}
            autoComplete="off"
            maxLength={64}
            hint="De 3 a 64 letras, números, puntos, guiones o guiones bajos."
          />
          <Field
            id="name"
            label="Nombre"
            value={form.name}
            error={errors.name}
            onChange={(value) => update("name", value)}
            autoComplete="name"
            maxLength={120}
          />
          <Field
            id="phone"
            label="Teléfono individual"
            value={form.phone}
            error={errors.phone}
            onChange={(value) => update("phone", value)}
            type="tel"
            autoComplete="tel"
            hint="Usa entre 7 y 15 dígitos; puedes incluir +, espacios, paréntesis, puntos o guiones."
          />
          <Field
            id="email"
            label="Correo individual"
            value={form.email}
            error={errors.email}
            onChange={(value) => update("email", value)}
            type="email"
            autoComplete="email"
          />

          <div className="space-y-2">
            <Label htmlFor="new-user-role">Rol de la cuenta</Label>
            <Select value={form.role} onValueChange={(value) => update("role", value as Role)}>
              <SelectTrigger
                id="new-user-role"
                aria-invalid={Boolean(errors.role)}
                aria-describedby={errors.role ? "new-user-role-error" : undefined}
              >
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Empleado</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p id="new-user-role-error" role="alert" className="text-sm text-destructive">
                {errors.role}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              El servidor conserva la autorización final. Crear administradores requiere
              confirmación adicional.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-initialPassword">Contraseña inicial</Label>
            <div className="relative">
              <Input
                id="new-user-initialPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                value={form.initialPassword}
                aria-invalid={Boolean(errors.initialPassword)}
                aria-describedby={
                  errors.initialPassword ? "new-user-password-error" : "new-user-password-hint"
                }
                onChange={(event) => update("initialPassword", event.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={
                  showPassword ? "Ocultar contraseña inicial" : "Mostrar contraseña inicial"
                }
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p id="new-user-password-hint" className="text-xs text-muted-foreground">
              Al menos 12 caracteres. Solo se envía por la solicitud segura a Supabase Auth; no se
              guarda en el perfil.
            </p>
            {errors.initialPassword && (
              <p id="new-user-password-error" role="alert" className="text-sm text-destructive">
                {errors.initialPassword}
              </p>
            )}
          </div>

          <Field
            id="confirmPassword"
            label="Confirmar contraseña inicial"
            value={form.confirmPassword}
            error={errors.confirmPassword}
            onChange={(value) => update("confirmPassword", value)}
            type="password"
            autoComplete="new-password"
          />

          {requestError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive md:col-span-2"
            >
              {requestError}
            </p>
          )}
          {success && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-md border border-emerald-600/30 bg-emerald-600/5 p-3 text-sm md:col-span-2"
            >
              El perfil quedó creado e inactivo. La solicitud fue aceptada por el servidor; esto no
              confirma la entrega del correo ni activa el acceso.
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end md:col-span-2">
            <Link
              to="/team"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </Link>
            <Button
              type="submit"
              disabled={busy || !provisioningEnabled}
              className="min-h-10 bg-[#D4AF37] text-black hover:bg-[#E5C158]"
            >
              {busy ? "Creando cuenta…" : "Crear cuenta"}
            </Button>
          </div>
          {busy && (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground md:col-span-2"
            >
              Esperando confirmación del servidor…
            </p>
          )}
        </form>
      )}

      <AlertDialog open={confirmAdmin} onOpenChange={(open) => !busy && setConfirmAdmin(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear una cuenta administradora?</AlertDialogTitle>
            <AlertDialogDescription>
              Tendrá acceso administrativo completo después de confirmar su identidad, cambiar la
              contraseña inicial y recibir activación. Esta acción se enviará al servidor solo
              después de confirmarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void create(true);
              }}
            >
              {busy ? "Creando…" : "Confirmar administrador"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  autoComplete,
  maxLength,
  hint,
}: {
  id: keyof CreationForm;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  hint?: string;
}) {
  const inputId = `new-user-${id}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type={type}
        autoComplete={autoComplete}
        maxLength={maxLength}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

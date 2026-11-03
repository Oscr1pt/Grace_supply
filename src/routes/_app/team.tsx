import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  useAuth,
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_EMPLOYEE_PERMISSIONS,
  type Permission,
  type Role,
  type User,
} from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Trash2, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { userPersistenceMessage } from "@/lib/persistence.js";
import { getEmployeeAccountStatus, validateEmployeeInvitation } from "@/lib/employeeManagement.js";

export const Route = createFileRoute("/_app/team")({ component: TeamPage });

const employeeProvisioningEnabled = import.meta.env.VITE_ACCOUNT_PROVISIONING_ENABLED === "true";
type Invitation = { username: string; name: string; email: string };
type InvitationErrors = Partial<Record<keyof Invitation, string>>;
type SecurityAction =
  | { kind: "activate"; target: User }
  | { kind: "role"; target: User; role: Role }
  | { kind: "revoke"; target: User };

function TeamPage() {
  const {
    user,
    users,
    usersStatus,
    usersError,
    refreshUsers,
    updateEmployee,
    removeEmployee,
    inviteEmployee,
    activateEmployee,
  } = useAuth();
  const actionLock = useRef(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [securityAction, setSecurityAction] = useState<SecurityAction | null>(null);
  const [invite, setInvite] = useState<Invitation>({ username: "", name: "", email: "" });
  const [inviteErrors, setInviteErrors] = useState<InvitationErrors>({});

  const runAction = async (key: string, operation: () => Promise<void>) => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setPendingAction(key);
    try {
      await operation();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : userPersistenceMessage(error));
      return false;
    } finally {
      actionLock.current = false;
      setPendingAction(null);
    }
  };

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = validateEmployeeInvitation(invite);
    setInviteErrors(errors);
    const firstInvalid = (Object.keys(errors) as (keyof Invitation)[])[0];
    if (firstInvalid) {
      document.getElementById(`employee-${firstInvalid}`)?.focus();
      return;
    }
    const confirmed = await runAction("invite", async () => {
      await inviteEmployee({
        username: invite.username.trim(),
        name: invite.name.trim(),
        email: invite.email.trim(),
      });
      toast.success(
        "Invitación registrada. La cuenta permanece inactiva hasta verificar el correo y activar el acceso.",
      );
      setInvite({ username: "", name: "", email: "" });
      setInviteErrors({});
    });
    if (!confirmed) return;
  };

  const togglePermission = (target: User, permission: Permission) => {
    const next = target.permissions.includes(permission)
      ? target.permissions.filter((current) => current !== permission)
      : [...target.permissions, permission];
    void runAction(`permission:${target.username}:${permission}`, async () => {
      await updateEmployee(target.username, { permissions: next });
      toast.success("Permisos actualizados.");
    });
  };

  const confirmSecurityAction = async () => {
    if (!securityAction) return;
    const action = securityAction;
    const completed = await runAction(`${action.kind}:${action.target.username}`, async () => {
      if (action.kind === "activate") {
        await activateEmployee(action.target.username);
        toast.success("El servidor confirmó la activación de la cuenta.");
      } else if (action.kind === "role") {
        await updateEmployee(action.target.username, {
          role: action.role,
          permissions: action.role === "admin" ? ALL_PERMISSIONS : DEFAULT_EMPLOYEE_PERMISSIONS,
        });
        toast.success("El servidor confirmó el cambio de rol.");
      } else {
        await removeEmployee(action.target.username);
        toast.success("El servidor confirmó la revocación del acceso.");
      }
    });
    if (completed) setSecurityAction(null);
  };

  const actionTitle =
    securityAction?.kind === "activate"
      ? "¿Activar esta cuenta?"
      : securityAction?.kind === "role"
        ? securityAction.role === "admin"
          ? "¿Dar acceso de administrador?"
          : "¿Cambiar a empleado?"
        : "¿Revocar este acceso?";
  const actionDescription =
    securityAction?.kind === "activate"
      ? `${securityAction.target.name} solo obtendrá acceso si el servidor confirma el correo y la activación.`
      : securityAction?.kind === "role"
        ? securityAction.role === "admin"
          ? `${securityAction.target.name} recibirá acceso administrativo a todas las secciones. El servidor conserva la autorización final.`
          : `${securityAction.target.name} pasará a tener los permisos iniciales de empleado.`
        : securityAction
          ? `${securityAction.target.name} dejará de acceder a Grace Supply. Sus registros se conservarán.`
          : "";
  const actionButtonLabel =
    securityAction?.kind === "activate"
      ? "Confirmar activación"
      : securityAction?.kind === "role"
        ? "Confirmar cambio"
        : "Revocar acceso";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empleados y permisos"
        description="Administra los accesos. Los cambios sensibles requieren confirmación del servidor."
      />

      <a
        href="/team/new"
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#D4AF37] px-4 text-sm font-medium text-black hover:bg-[#E5C158] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Crear usuario
      </a>

      {employeeProvisioningEnabled ? (
        <form
          onSubmit={submitInvite}
          noValidate
          aria-busy={pendingAction === "invite"}
          className="mb-6 grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5 md:grid-cols-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="employee-username">Usuario</Label>
            <Input
              id="employee-username"
              autoComplete="off"
              maxLength={64}
              value={invite.username}
              aria-invalid={Boolean(inviteErrors.username)}
              aria-describedby={
                inviteErrors.username ? "employee-username-error" : "employee-username-hint"
              }
              onChange={(event) => {
                setInvite({ ...invite, username: event.target.value });
                setInviteErrors((current) => ({ ...current, username: undefined }));
              }}
            />
            <p id="employee-username-hint" className="text-xs text-muted-foreground">
              De 3 a 64 letras, números, puntos, guiones o guiones bajos.
            </p>
            {inviteErrors.username && (
              <p id="employee-username-error" role="alert" className="text-xs text-destructive">
                {inviteErrors.username}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employee-name">Nombre</Label>
            <Input
              id="employee-name"
              autoComplete="name"
              maxLength={120}
              value={invite.name}
              aria-invalid={Boolean(inviteErrors.name)}
              aria-describedby={inviteErrors.name ? "employee-name-error" : undefined}
              onChange={(event) => {
                setInvite({ ...invite, name: event.target.value });
                setInviteErrors((current) => ({ ...current, name: undefined }));
              }}
            />
            {inviteErrors.name && (
              <p id="employee-name-error" role="alert" className="text-xs text-destructive">
                {inviteErrors.name}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employee-email">Correo individual</Label>
            <Input
              id="employee-email"
              type="email"
              autoComplete="email"
              value={invite.email}
              aria-invalid={Boolean(inviteErrors.email)}
              aria-describedby={inviteErrors.email ? "employee-email-error" : undefined}
              onChange={(event) => {
                setInvite({ ...invite, email: event.target.value });
                setInviteErrors((current) => ({ ...current, email: undefined }));
              }}
            />
            {inviteErrors.email && (
              <p id="employee-email-error" role="alert" className="text-xs text-destructive">
                {inviteErrors.email}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            La invitación crea un perfil inactivo con permisos iniciales de ventas. No confirma la
            entrega del correo ni activa el acceso.
          </p>
          <Button
            type="submit"
            disabled={Boolean(pendingAction)}
            className="w-full bg-[#D4AF37] text-black hover:bg-[#E5C158] md:self-end"
          >
            {pendingAction === "invite" ? "Enviando invitación…" : "Invitar empleado"}
          </Button>
          {pendingAction === "invite" && (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground md:col-span-3"
            >
              Esperando confirmación del servidor…
            </p>
          )}
        </form>
      ) : (
        <div
          role="note"
          className="mb-6 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] px-4 py-3 text-sm text-muted-foreground"
        >
          Las invitaciones están deshabilitadas hasta verificar el correo transaccional y las URL de
          este entorno. No hay registro público ni creación de administradores por invitación.
        </div>
      )}

      {usersStatus === "loading" ? (
        <div role="status" aria-live="polite" className="space-y-3">
          <p className="text-sm text-muted-foreground">Cargando cuentas de empleados…</p>
          <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        </div>
      ) : usersStatus === "error" ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm">{usersError ?? "No se pudieron cargar las cuentas."}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={Boolean(pendingAction)}
            onClick={() => void refreshUsers()}
          >
            Reintentar
          </Button>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">No hay cuentas de empleados para mostrar.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Las cuentas aparecerán aquí cuando el servidor confirme su creación.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((employee) => {
            const isSelf = employee.username.toLowerCase() === user?.username.toLowerCase();
            const isAdmin = employee.role === "admin";
            const status = getEmployeeAccountStatus(employee.active);
            return (
              <article
                key={employee.username}
                className="rounded-lg border border-border bg-card p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${isAdmin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      {isAdmin ? (
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <UserIcon className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="break-words font-medium">
                        {employee.name}{" "}
                        {isSelf && <span className="text-xs text-muted-foreground">(tú)</span>}
                      </h2>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        @{employee.username}
                      </p>
                      <p
                        className={`mt-1 text-xs font-medium ${status.tone === "active" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}
                      >
                        {status.label}
                      </p>
                      {!employee.active && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{status.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    {!employee.active && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(pendingAction)}
                        onClick={() => setSecurityAction({ kind: "activate", target: employee })}
                      >
                        Activar cuenta
                      </Button>
                    )}
                    <Select
                      value={employee.role}
                      onValueChange={(value) => {
                        if (value !== employee.role)
                          setSecurityAction({
                            kind: "role",
                            target: employee,
                            role: value as Role,
                          });
                      }}
                      disabled={isSelf || Boolean(pendingAction)}
                    >
                      <SelectTrigger
                        className="w-full sm:w-40"
                        aria-label={`Rol de ${employee.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Empleado</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSelf || Boolean(pendingAction)}
                      aria-label={`Revocar acceso a ${employee.name}`}
                      onClick={() => setSecurityAction({ kind: "revoke", target: employee })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Revocar
                    </Button>
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <EmployeeContactEditor
                    employee={employee}
                    disabled={Boolean(pendingAction)}
                    onSave={(patch) =>
                      runAction(`profile:${employee.username}`, async () => {
                        await updateEmployee(employee.username, patch);
                        toast.success("El servidor confirmó los datos del perfil.");
                      })
                    }
                  />
                  {isAdmin ? (
                    <p className="text-xs text-muted-foreground">
                      Los administradores tienen acceso completo a todas las secciones.
                    </p>
                  ) : (
                    <fieldset disabled={Boolean(pendingAction)} className="min-w-0">
                      <legend className="mb-2 text-xs font-medium text-muted-foreground">
                        Permisos de acceso
                      </legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PERMISSIONS.map((permission) => (
                          <label
                            key={permission.key}
                            className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <Checkbox
                              checked={employee.permissions.includes(permission.key)}
                              disabled={Boolean(pendingAction)}
                              onCheckedChange={() => togglePermission(employee, permission.key)}
                            />
                            <span>{permission.label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={Boolean(securityAction)}
        onOpenChange={(open) => !pendingAction && !open && setSecurityAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionTitle}</AlertDialogTitle>
            <AlertDialogDescription>{actionDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingAction)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(pendingAction)}
              className={
                securityAction?.kind === "revoke"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(event) => {
                event.preventDefault();
                void confirmSecurityAction();
              }}
            >
              {pendingAction ? "Guardando…" : actionButtonLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmployeeContactEditor({
  employee,
  disabled,
  onSave,
}: {
  employee: User;
  disabled: boolean;
  onSave: (patch: { name: string; phone: string | null }) => Promise<boolean>;
}) {
  const [name, setName] = useState(employee.name);
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const unchanged = name === employee.name && phone === (employee.phone ?? "");

  return (
    <form
      className="mb-4 grid gap-3 sm:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || unchanged) return;
        if (!name.trim() || name.trim().length > 120) {
          setError("Escribe un nombre de hasta 120 caracteres.");
          return;
        }
        setError(null);
        const saved = await onSave({ name: name.trim(), phone: phone.trim() || null });
        if (!saved) setError("No se confirmó el cambio. Revisa el estado antes de repetir.");
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`employee-name-${employee.username}`}>Nombre</Label>
        <Input
          id={`employee-name-${employee.username}`}
          value={name}
          maxLength={120}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`employee-phone-${employee.username}`}>Teléfono</Label>
        <Input
          id={`employee-phone-${employee.username}`}
          type="tel"
          autoComplete="tel"
          value={phone}
          maxLength={30}
          disabled={disabled}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" variant="outline" disabled={disabled || unchanged}>
          Guardar perfil
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

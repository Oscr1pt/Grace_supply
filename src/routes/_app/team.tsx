import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_PERMISSIONS,
  DEFAULT_EMPLOYEE_PERMISSIONS,
  PERMISSIONS,
  useAuth,
  type Permission,
  type Role,
  type User,
} from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { userPersistenceMessage } from "@/lib/persistence.js";
import { getEmployeeAccountStatus } from "@/lib/employeeManagement.js";
import { Check, Copy, Search, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/team")({ component: TeamPage });

type StatusFilter = "todos" | "activos" | "inactivos" | "pendientes";
type EmployeePatch = { name: string; phone: string | null; role: Role; permissions: Permission[] };
type Confirmation =
  | { kind: "activate"; target: User }
  | { kind: "revoke"; target: User }
  | { kind: "admin-role"; target: User; patch: EmployeePatch };

function TeamPage() {
  const {
    user,
    users,
    usersStatus,
    usersError,
    refreshUsers,
    updateEmployee,
    removeEmployee,
    activateEmployee,
    createEmployeeRecoveryLink,
  } = useAuth();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const actionLock = useRef(false);
  const selectedEmployee =
    users.find((employee) => employee.username.toLowerCase() === selectedUsername?.toLowerCase()) ??
    null;

  useEffect(() => {
    if (
      selectedUsername &&
      !users.some((employee) => employee.username.toLowerCase() === selectedUsername.toLowerCase())
    ) {
      setSelectedUsername(null);
    }
  }, [selectedUsername, users]);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return users.filter((employee) => {
      const matchesQuery =
        !needle ||
        employee.name.toLocaleLowerCase().includes(needle) ||
        employee.username.toLocaleLowerCase().includes(needle);
      const matchesStatus =
        statusFilter === "todos" ||
        (statusFilter === "activos" && employee.active) ||
        (statusFilter === "inactivos" && !employee.active && !employee.passwordChangeRequired) ||
        (statusFilter === "pendientes" && employee.passwordChangeRequired === true);
      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter, users]);

  const runAction = async (operation: () => Promise<void>) => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setPendingAction(true);
    try {
      await operation();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : userPersistenceMessage(error));
      return false;
    } finally {
      actionLock.current = false;
      setPendingAction(false);
    }
  };

  const saveEmployee = async (target: User, patch: EmployeePatch) => {
    const completed = await runAction(() => updateEmployee(target.username, patch));
    if (completed) toast.success("Cambios del empleado guardados.");
    return completed;
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const action = confirmation;
    const completed = await runAction(async () => {
      if (action.kind === "activate") await activateEmployee(action.target.username);
      else if (action.kind === "revoke") await removeEmployee(action.target.username);
      else await updateEmployee(action.target.username, action.patch);
    });
    if (completed) {
      toast.success(
        action.kind === "activate"
          ? "Acceso activado."
          : action.kind === "revoke"
            ? "Acceso revocado."
            : "Rol y permisos actualizados.",
      );
      setConfirmation(null);
      setSelectedUsername(null);
    }
  };

  const confirmationCopy =
    confirmation?.kind === "activate"
      ? {
          title: "¿Activar acceso?",
          description: `${confirmation.target.name}: se verificará la configuración de contraseña y el servidor conciliará el estado de Auth antes de activar el perfil.`,
          action: "Activar acceso",
        }
      : confirmation?.kind === "revoke"
        ? {
            title: "¿Revocar acceso?",
            description: `${confirmation.target.name} dejará de iniciar sesión y de acceder a Grace Supply. Sus registros se conservarán.`,
            action: "Revocar acceso",
          }
        : confirmation
          ? {
              title: "¿Asignar rol administrador?",
              description: `${confirmation.target.name} tendrá acceso administrativo a todas las secciones. El servidor aplicará sus controles de autorización.`,
              action: "Confirmar cambio",
            }
          : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empleados"
        description="Busca y administra las cuentas, roles y accesos del equipo."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Buscar empleados"
            placeholder="Buscar por nombre o usuario"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <a
          href="/team/new"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#D4AF37] px-4 text-sm font-medium text-black hover:bg-[#E5C158] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Crear usuario
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="employee-status-filter" className="text-sm">
          Estado
        </Label>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger id="employee-status-filter" className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
            <SelectItem value="pendientes">Pendientes de configuración</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {usersStatus === "error" && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
        >
          <p>{usersError ?? "No se pudieron cargar los empleados."}</p>
          <Button variant="outline" onClick={() => void refreshUsers()}>
            Reintentar
          </Button>
        </div>
      )}
      <div
        role="region"
        aria-label="Lista de empleados"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3.5 text-left">
                Nombre / usuario
              </th>
              <th scope="col" className="px-4 py-3.5 text-left">
                Rol
              </th>
              <th scope="col" className="px-4 py-3.5 text-left">
                Teléfono
              </th>
              <th scope="col" className="px-4 py-3.5 text-left">
                Estado
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Detalles
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {usersStatus === "loading" && users.length === 0 ? (
              <tr>
                <td colSpan={5} role="status" className="py-12 text-center text-muted-foreground">
                  Cargando empleados…
                </td>
              </tr>
            ) : usersStatus === "error" && users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  No se muestran resultados hasta recuperar la lista.
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  {query || statusFilter !== "todos"
                    ? "No hay empleados que coincidan con la búsqueda y el estado."
                    : "Aún no hay empleados registrados."}
                </td>
              </tr>
            ) : (
              filteredUsers.map((employee) => {
                const status = getEmployeeAccountStatus(
                  employee.active,
                  employee.passwordChangeRequired,
                  employee.emailConfirmed,
                );
                return (
                  <tr
                    key={employee.username}
                    onClick={() => setSelectedUsername(employee.username)}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${employee.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                        >
                          {employee.role === "admin" ? (
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <UserRound className="h-4 w-4" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {employee.name}
                            {employee.username.toLowerCase() === user?.username.toLowerCase()
                              ? " (tú)"
                              : ""}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            @{employee.username}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {employee.role === "admin" ? "Administrador" : "Empleado"}
                    </td>
                    <td className="px-4 py-3.5">
                      {employee.phone || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.tone === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUsername(employee.username)}
                        aria-label={`Ver detalles de ${employee.name}`}
                      >
                        Ver detalles
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedEmployee && (
        <EmployeeDetailsDialog
          key={selectedEmployee.username}
          employee={selectedEmployee}
          isSelf={selectedEmployee.username.toLowerCase() === user?.username.toLowerCase()}
          open
          onOpenChange={(open) => {
            if (!open && !pendingAction) setSelectedUsername(null);
          }}
          pending={pendingAction}
          onSave={(patch) => saveEmployee(selectedEmployee, patch)}
          onAccessAction={(kind) => setConfirmation({ kind, target: selectedEmployee })}
          onAdminRoleConfirm={(patch) =>
            setConfirmation({ kind: "admin-role", target: selectedEmployee, patch })
          }
          onRecoveryLink={createEmployeeRecoveryLink}
        />
      )}

      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => !pendingAction && !open && setConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingAction}
              className={
                confirmation?.kind === "revoke"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(event) => {
                event.preventDefault();
                void confirmAction();
              }}
            >
              {pendingAction ? "Procesando…" : confirmationCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmployeeDetailsDialog({
  employee,
  isSelf,
  open,
  onOpenChange,
  pending,
  onSave,
  onAccessAction,
  onAdminRoleConfirm,
  onRecoveryLink,
}: {
  employee: User;
  isSelf: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSave: (patch: EmployeePatch) => Promise<boolean>;
  onAccessAction: (kind: "activate" | "revoke") => void;
  onAdminRoleConfirm: (patch: EmployeePatch) => void;
  onRecoveryLink: (username: string) => Promise<string>;
}) {
  const [name, setName] = useState(employee.name);
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [role, setRole] = useState<Role>(employee.role);
  const [permissions, setPermissions] = useState<Permission[]>(employee.permissions);
  const [error, setError] = useState<string | null>(null);
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const isAdminSelf = employee.role === "admin" && isSelf;
  const status = getEmployeeAccountStatus(
    employee.active,
    employee.passwordChangeRequired,
    employee.emailConfirmed,
  );
  const nextPermissions = role === "admin" ? ALL_PERMISSIONS : permissions;
  const patch: EmployeePatch = {
    name: name.trim(),
    phone: phone.trim() || null,
    role,
    permissions: nextPermissions,
  };
  const changed =
    patch.name !== employee.name ||
    patch.phone !== (employee.phone ?? null) ||
    role !== employee.role ||
    nextPermissions.length !== employee.permissions.length ||
    nextPermissions.some((permission) => !employee.permissions.includes(permission));
  const activationBlocked = !employee.active && employee.passwordChangeRequired === true;
  const dialogBusy = pending || recoveryPending;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (dialogBusy || !changed) return;
    if (!patch.name || patch.name.length > 120) {
      setError("Escribe un nombre de hasta 120 caracteres.");
      return;
    }
    setError(null);
    if (role === "admin" && employee.role !== "admin") {
      onAdminRoleConfirm(patch);
      return;
    }
    if (!(await onSave(patch)))
      setError("Resultado no confirmado. Los datos editados siguen disponibles.");
  };

  const requestRecovery = async () => {
    setRecoveryPending(true);
    setRecoveryUrl(null);
    setCopied(false);
    setError(null);
    try {
      setRecoveryUrl(await onRecoveryLink(employee.username));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar el enlace privado.");
    } finally {
      setRecoveryPending(false);
    }
  };

  const copyRecovery = async () => {
    if (!recoveryUrl) return;
    try {
      await navigator.clipboard.writeText(recoveryUrl);
      setCopied(true);
      toast.success("Enlace privado copiado.");
    } catch {
      setError("No se pudo copiar. Selecciona el enlace y cópialo manualmente.");
    }
  };

  const close = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRecoveryUrl(null);
      setCopied(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{employee.name}</DialogTitle>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
              {employee.role === "admin" ? "Administrador" : "Empleado"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs ${status.tone === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
            >
              {status.label}
            </span>
          </div>
          <DialogDescription>
            @{employee.username} · {status.description}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5" aria-busy={dialogBusy}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-edit-name">Nombre</Label>
              <Input
                id="employee-edit-name"
                value={name}
                maxLength={120}
                disabled={dialogBusy}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-edit-phone">Teléfono</Label>
              <Input
                id="employee-edit-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                maxLength={30}
                disabled={dialogBusy}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-edit-role">Rol</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  const nextRole = value as Role;
                  setRole(nextRole);
                  setPermissions(
                    nextRole === "admin"
                      ? [...ALL_PERMISSIONS]
                      : employee.role === "admin"
                        ? [...DEFAULT_EMPLOYEE_PERMISSIONS]
                        : [...employee.permissions],
                  );
                }}
                disabled={dialogBusy || isAdminSelf}
              >
                <SelectTrigger id="employee-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Empleado</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {role === "admin" && (
            <p className="text-sm text-muted-foreground">
              El rol administrador incluye acceso a todas las secciones.
            </p>
          )}
          <fieldset disabled={dialogBusy || role === "admin"} className="space-y-3">
            <legend className="text-sm font-medium">Permisos</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PERMISSIONS.map((permission) => (
                <label
                  key={permission.key}
                  className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={role === "admin" || permissions.includes(permission.key)}
                    disabled={role === "admin" || dialogBusy}
                    onCheckedChange={(checked) =>
                      setPermissions((current) =>
                        checked
                          ? [...new Set([...current, permission.key])]
                          : current.filter((item) => item !== permission.key),
                      )
                    }
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {activationBlocked && (
            <p
              role="note"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              Debe completar la configuración inicial de contraseña antes de activar el acceso.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              type="submit"
              disabled={dialogBusy || !changed}
              className="bg-[#D4AF37] text-black hover:bg-[#E5C158]"
            >
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
            {employee.active ? (
              <Button
                type="button"
                variant="destructive"
                disabled={dialogBusy || isSelf}
                onClick={() => onAccessAction("revoke")}
              >
                Revocar acceso
              </Button>
            ) : !activationBlocked ? (
              <Button
                type="button"
                variant="outline"
                disabled={dialogBusy}
                onClick={() => onAccessAction("activate")}
              >
                Activar acceso
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled>
                Activar acceso
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={dialogBusy || employee.passwordChangeRequired === true}
              onClick={() => void requestRecovery()}
            >
              {recoveryPending ? "Generando enlace…" : "Restablecer contraseña"}
            </Button>
          </div>
          {employee.passwordChangeRequired === true && (
            <p className="text-xs text-muted-foreground">
              El enlace de recuperación está disponible cuando termine la configuración inicial de
              contraseña.
            </p>
          )}
          {recoveryUrl && (
            <div className="space-y-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/[0.06] p-3">
              <p className="text-sm font-medium">Enlace privado de un solo uso</p>
              <p className="text-xs text-muted-foreground">
                Entrégalo únicamente al titular por un canal privado. El enlace se borrará al cerrar
                este diálogo.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="Enlace privado de recuperación"
                  readOnly
                  value={recoveryUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={() => void copyRecovery()}>
                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                  {copied ? (
                    <>
                      <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    "Copiar enlace"
                  )}
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={dialogBusy}
              onClick={() => close(false)}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, PERMISSIONS, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, type Permission, type Role, type User } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { userPersistenceMessage } from "@/lib/persistence.js";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
});

const employeeProvisioningEnabled = import.meta.env.VITE_ACCOUNT_PROVISIONING_ENABLED === "true";

function TeamPage() {
  const { user, users, updateEmployee, removeEmployee, inviteEmployee, activateEmployee } = useAuth();
  const [pending, setPending] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<User | null>(null);
  const [invite, setInvite] = useState({ username: "", name: "", email: "" });

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await inviteEmployee(invite);
      toast.success("Invitation sent. The account remains inactive until email confirmation.");
      setInvite({ username: "", name: "", email: "" });
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  const activate = async (username: string) => {
    if (pending) return;
    setPending(true);
    try {
      await activateEmployee(username);
      toast.success("Verified email and activated account.");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  const togglePerm = async (username: string, current: Permission[], perm: Permission) => {
    const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    setPending(true);
    try {
      await updateEmployee(username, { permissions: next });
      toast.success("Permisos actualizados");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  const changeRole = async (username: string, role: Role) => {
    setPending(true);
    try {
      await updateEmployee(username, {
        role,
        permissions: role === "admin" ? ALL_PERMISSIONS : DEFAULT_EMPLOYEE_PERMISSIONS,
      });
      toast.success("Rol actualizado");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  const revokeEmployee = async () => {
    if (!revokeTarget || pending) return;
    setPending(true);
    try {
      await removeEmployee(revokeTarget.username);
      toast.success("Acceso revocado");
      setRevokeTarget(null);
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Empleados y permisos"
        description="Administra los permisos y revoca accesos confirmados."
      />

      {employeeProvisioningEnabled ? (
        <form onSubmit={submitInvite} className="mb-6 grid gap-3 rounded-lg border border-border bg-card p-5 md:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="employee-username">Usuario</Label><Input id="employee-username" autoComplete="off" value={invite.username} onChange={(event) => setInvite({ ...invite, username: event.target.value })} required /></div>
          <div className="space-y-1.5"><Label htmlFor="employee-name">Nombre</Label><Input id="employee-name" autoComplete="name" value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} required /></div>
          <div className="space-y-1.5"><Label htmlFor="employee-email">Correo individual</Label><Input id="employee-email" type="email" autoComplete="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} required /></div>
          <p className="text-xs text-muted-foreground md:col-span-2">Invitacion de empleado con permiso inicial de ventas. El perfil queda inactivo hasta verificar el correo. El servidor no permite crear administradores.</p>
          <Button type="submit" disabled={pending || !invite.username.trim() || !invite.name.trim() || !invite.email.trim()} className="bg-[#D4AF37] text-black hover:bg-[#E5C158]">{pending ? "Enviando..." : "Invitar empleado"}</Button>
        </form>
      ) : (
        <div role="note" className="mb-6 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] px-4 py-3 text-sm text-muted-foreground">
          El aprovisionamiento esta apagado hasta verificar el correo transaccional y las URL del entorno. Cada invitacion administrativa requiere un correo individual; no hay registro publico ni alta de administradores.
        </div>
      )}

      <div className="space-y-4">
        {users.map((u) => {
          const isSelf = u.username.toLowerCase() === user?.username.toLowerCase();
          const admin = u.role === "admin";
          return (
            <div key={u.username} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-full grid place-items-center ${admin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {admin ? <ShieldCheck className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="font-medium">{u.name} {isSelf && <span className="text-xs text-muted-foreground">(tú)</span>}</div>
                    <div className="text-xs text-muted-foreground font-mono">@{u.username}</div>
                    {!u.active && <div className="text-xs text-amber-500">Pendiente de correo confirmado</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!u.active && <Button size="sm" variant="outline" disabled={pending} onClick={() => void activate(u.username)}>Activar</Button>}
                  <Select
                    value={u.role}
                    onValueChange={(v) => void changeRole(u.username, v as Role)}
                    disabled={isSelf || pending}
                  >
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Empleado</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={isSelf || pending}
                    aria-label={`Revocar acceso a ${u.name}`}
                    title="Revocar acceso"
                    onClick={() => setRevokeTarget(u)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                {admin ? (
                  <p className="text-xs text-muted-foreground">Los administradores tienen acceso completo a todas las secciones.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {PERMISSIONS.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2">
                        <Checkbox
                          checked={u.permissions.includes(p.key)}
                            disabled={pending}
                            onCheckedChange={() => void togglePerm(u.username, u.permissions, p.key)}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => !pending && !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar este acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.name} dejará de acceder a Grace Supply. Sus registros se conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => { event.preventDefault(); void revokeEmployee(); }}
            >
              {pending ? "Revocando…" : "Revocar acceso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

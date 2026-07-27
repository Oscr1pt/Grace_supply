import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, PERMISSIONS, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, type Permission, type Role } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
});

const emptyForm = {
  name: "",
  username: "",
  password: "",
  role: "employee" as Role,
  permissions: DEFAULT_EMPLOYEE_PERMISSIONS as Permission[],
};

function TeamPage() {
  const { user, users, addEmployee, updateEmployee, removeEmployee } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const submit = () => {
    if (!form.name.trim() || !form.username.trim()) { toast.error("Nombre y usuario son obligatorios"); return; }
    try {
      addEmployee({
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        permissions: form.role === "admin" ? ALL_PERMISSIONS : form.permissions,
      });
      toast.success("Empleado agregado");
      setForm(emptyForm);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar");
    }
  };

  const togglePerm = (username: string, current: Permission[], perm: Permission) => {
    const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    updateEmployee(username, { permissions: next });
  };

  return (
    <div>
      <PageHeader
        title="Empleados y permisos"
        description="Controla quién entra al sistema y a qué secciones tiene acceso."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus /> Nuevo empleado</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nombre completo</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Juana Pérez" />
                </div>
                <div className="space-y-1.5">
                  <Label>Usuario</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })}
                    placeholder="juana.perez"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Contraseña temporal</Label>
                  <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="mínimo 6 caracteres" />
                </div>
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Empleado</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.role === "employee" && (
                  <div className="space-y-2">
                    <Label>Secciones permitidas</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PERMISSIONS.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2">
                          <Checkbox
                            checked={form.permissions.includes(p.key)}
                            onCheckedChange={(c) =>
                              setForm({
                                ...form,
                                permissions: c
                                  ? [...form.permissions, p.key]
                                  : form.permissions.filter((x) => x !== p.key),
                              })
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={submit}>Agregar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

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
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={u.role}
                    onValueChange={(v) =>
                      updateEmployee(u.username, {
                        role: v as Role,
                        permissions: v === "admin" ? ALL_PERMISSIONS : DEFAULT_EMPLOYEE_PERMISSIONS,
                      })
                    }
                    disabled={isSelf}
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
                    disabled={isSelf}
                    onClick={() => {
                      if (!confirm(`¿Eliminar la cuenta de ${u.name}?`)) return;
                      removeEmployee(u.username);
                      toast.success("Cuenta eliminada");
                    }}
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
                          onCheckedChange={() => togglePerm(u.username, u.permissions, p.key)}
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
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLocalStore, uid, fmtDate } from "@/lib/storage";
import type { Client } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/clients")({
  component: ClientsPage,
});

const empty: Omit<Client, "id" | "createdAt"> = { name: "", email: "", phone: "", address: "", notes: "" };

function ClientsPage() {
  const [clients, setClients] = useLocalStore<Client[]>("lustre_clients", []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState("");

  const startNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (c: Client) => { setEditing(c); setForm(c); setOpen(true); };

  const save = () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (editing) {
      setClients(clients.map((c) => (c.id === editing.id ? { ...editing, ...form } : c)));
      toast.success("Cliente actualizado");
    } else {
      setClients([{ id: uid(), createdAt: new Date().toISOString(), ...form }, ...clients]);
      toast.success("Cliente agregado");
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    if (!confirm("¿Eliminar este cliente?")) return;
    setClients(clients.filter((c) => c.id !== id));
    toast.success("Cliente eliminado");
  };

  const filtered = clients.filter((c) =>
    [c.name, c.email, c.phone].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Tu cartera de clientes."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={startNew}><Plus /> Nuevo cliente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Nombre completo"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Correo"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                  <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                </div>
                <Field label="Dirección"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                <Field label="Notas"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ej. compra piedras sueltas para montar en joyería propia" /></Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save}>{editing ? "Guardar cambios" : "Agregar cliente"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar clientes…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Correo</th>
              <th className="text-left px-4 py-3">Teléfono</th>
              <th className="text-left px-4 py-3">Agregado</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Aún no hay clientes.</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

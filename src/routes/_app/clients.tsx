import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useSupabaseTable, uid, fmtDate, fmtMoney } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type {
  Client,
  ClientCredit,
  CreditPayment,
  Sale,
  PaymentMethod,
  CreditStatus,
} from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, CreditCard, History, DollarSign, CheckCircle2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { PersistenceError, userPersistenceMessage } from "@/lib/persistence.js";
import { getConfirmedBusinessOperation, postBusinessOperation } from "@/lib/businessOperations";

export const Route = createFileRoute("/_app/clients")({
  component: ClientsPage,
});

const emptyClient: Omit<Client, "id" | "createdAt"> = {
  name: "",
  email: "",
  phone: "",
  phoneSecondary: "",
  rnc: "",
  province: "Santo Domingo",
  city: "Santo Domingo",
  address: "",
  notes: "",
  status: "activo",
};

function ClientsPage() {
  const { data: clients, insert, update, remove } = useSupabaseTable<Client>("clients");
  const { data: credits, refresh: refreshCredits } = useSupabaseTable<ClientCredit>("client_credits");
  const { data: payments, refresh: refreshPayments } = useSupabaseTable<CreditPayment>("credit_payments");
  const { data: sales } = useSupabaseTable<Sale>("sales");
  const [settings] = useSettings();
  const paymentRequestKey = useRef<string | null>(null);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [q, setQ] = useState("");

  // Credit & Sales History Modals
  const [selectedClientForCredits, setSelectedClientForCredits] = useState<Client | null>(null);
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<Client | null>(null);
  const [creditFilter, setCreditFilter] = useState<"todas" | "pendiente" | "parcial" | "pagada">("todas");

  // Payment registration
  const [paymentCredit, setPaymentCredit] = useState<ClientCredit | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("efectivo");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [pending, setPending] = useState(false);
  const [paymentNeedsReconciliation, setPaymentNeedsReconciliation] = useState(false);

  const startNew = () => {
    setEditing(null);
    setForm(emptyClient);
    setOpenForm(true);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setForm({ ...emptyClient, ...c });
    setOpenForm(true);
  };

  const saveClient = async () => {
    if (pending) return;
    if (!form.name.trim()) {
      toast.error("El nombre completo es obligatorio");
      return;
    }
    setPending(true);
    try {
      if (editing) {
        await update(editing.id, form);
        toast.success("Cliente actualizado");
      } else {
        await insert({ id: uid(), createdAt: new Date().toISOString(), ...form });
        toast.success("Cliente agregado");
      }
      setOpenForm(false);
    } catch (e) {
      toast.error(userPersistenceMessage(e));
    } finally {
      setPending(false);
    }
  };

  const removeClient = async (c: Client) => {
    const hasSales = sales.some((s) => s.clientId === c.id);
    const hasCredits = credits.some((cr) => cr.clientId === c.id);

    if (hasSales || hasCredits) {
      if (confirm(`El cliente "${c.name}" tiene historial de ventas o créditos asociados. ¿Deseas desactivarlo para conservar la integridad del historial?`)) {
        try {
          await update(c.id, { status: "inactivo" });
          toast.success("Cliente desactivado");
        } catch (error) {
          toast.error(userPersistenceMessage(error));
        }
      }
      return;
    }

    if (!confirm(`¿Eliminar al cliente "${c.name}"?`)) return;
    try {
      await remove(c.id);
      toast.success("Cliente eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const openPaymentModal = (credit: ClientCredit) => {
    setPaymentNeedsReconciliation(false);
    setPaymentCredit(credit);
    setPayAmount(credit.balance);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod("efectivo");
    setPayRef("");
    setPayNote("");
  };

  const registerPayment = async () => {
    if (pending || paymentNeedsReconciliation || !paymentCredit) return;
    if (payAmount <= 0) { toast.error("El monto debe ser mayor a 0"); return; }
    if (payAmount > paymentCredit.balance) { toast.error("El monto no puede superar el saldo pendiente"); return; }
    setPending(true);
    const idempotencyKey = paymentRequestKey.current ?? globalThis.crypto.randomUUID();
    paymentRequestKey.current = idempotencyKey;
    try {
      await postBusinessOperation("client_payment", {
        idempotency_key: idempotencyKey, credit_type: "client", credit_id: paymentCredit.id,
        amount: Number(payAmount).toFixed(2), date: payDate, method: payMethod,
        reference: payRef || null, note: payNote || null,
      });
      paymentRequestKey.current = null;
      void refreshCredits(); void refreshPayments();
      toast.success("Pago confirmado"); setPaymentCredit(null);
    } catch (e) {
      const uncertain = e instanceof PersistenceError && e.kind === "uncertain";
      if (uncertain) setPaymentNeedsReconciliation(true); else paymentRequestKey.current = null;
      toast.error(userPersistenceMessage(e));
    } finally { setPending(false); }
  };

  const reconcilePayment = async () => {
    const key = paymentRequestKey.current;
    if (!key || pending) return;
    setPending(true);
    try {
      const result = await getConfirmedBusinessOperation("client_payment", key);
      if (!result) { toast.error("El pago todav?a no aparece confirmado. Conserva la operaci?n y vuelve a consultar."); return; }
      paymentRequestKey.current = null; setPaymentNeedsReconciliation(false);
      void refreshCredits(); void refreshPayments();
      toast.success("Pago confirmado y reconciliado"); setPaymentCredit(null);
    } catch (error) { toast.error(userPersistenceMessage(error)); }
    finally { setPending(false); }
  };

  const filteredClients = clients.filter((c) =>
    [c.name, c.email, c.phone, c.rnc, c.city].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase())
  );

  // Client Credits
  const clientCredits = selectedClientForCredits
    ? credits.filter((cr) => cr.clientId === selectedClientForCredits.id)
    : [];

  const totalCreditSales = clientCredits.filter((cr) => cr.status !== "anulada").reduce((s, cr) => s + cr.total, 0);
  const totalCreditPaid = clientCredits.reduce((s, cr) => s + cr.paid, 0);
  const totalCreditBalance = clientCredits.reduce((s, cr) => s + cr.balance, 0);

  const filteredClientCredits = clientCredits.filter((cr) => {
    if (creditFilter === "todas") return true;
    return cr.status === creditFilter;
  });

  // Client Sales History
  const clientSales = selectedClientForHistory
    ? sales.filter((s) => s.clientId === selectedClientForHistory.id)
    : [];

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Gestión de cartera de clientes, cuentas por cobrar (créditos) e historial de compras."
        actions={
          <Dialog open={openForm} onOpenChange={setOpenForm}>
            <DialogTrigger asChild>
              <Button onClick={startNew} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                <Plus className="h-4 w-4 mr-1.5" /> Nuevo cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Field label="Nombre Completo">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Juan Pérez / Barbería El Estilo" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="RNC / Cédula">
                    <Input value={form.rnc || ""} onChange={(e) => setForm({ ...form, rnc: e.target.value })} placeholder="001-0000000-0" />
                  </Field>
                  <Field label="Estado">
                    <Select value={form.status || "activo"} onValueChange={(v) => setForm({ ...form, status: v as "activo" | "inactivo" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Correo Electrónico">
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="juan@barberia.com" />
                  </Field>
                  <Field label="Teléfono Principal">
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="809-555-0100" />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Provincia">
                    <Input value={form.province || ""} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Santo Domingo" />
                  </Field>
                  <Field label="Ciudad / Municipio">
                    <Input value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Santo Domingo Este" />
                  </Field>
                </div>

                <Field label="Dirección">
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Calle Principal #45" />
                </Field>

                <Field label="Notas / Preferencias">
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Cliente frecuente de ceras y bálsamos de barba, prefiere pedidos al por mayor" />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenForm(false)} disabled={pending}>Cancelar</Button>
                <Button onClick={saveClient} disabled={pending} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                  {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar cliente"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar clientes por nombre, teléfono, RNC…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            <tr>
              <th className="text-left px-4 py-3.5">Nombre / Razón Social</th>
              <th className="text-left px-4 py-3.5">Contacto</th>
              <th className="text-left px-4 py-3.5">Ubicación</th>
              <th className="text-left px-4 py-3.5">Registrado</th>
              <th className="px-4 py-3.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  Aún no hay clientes registrados.
                </td>
              </tr>
            ) : (
              filteredClients.map((c) => {
                const pendingCount = credits.filter((cr) => cr.clientId === c.id && cr.balance > 0).length;

                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-[#D4AF37]" />
                        {c.name}
                      </div>
                      {c.rnc && <div className="text-[11px] font-mono text-muted-foreground">RNC: {c.rnc}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <div>{c.phone || "Sin teléfono"}</div>
                      <div className="text-[11px]">{c.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {[c.city, c.province].filter(Boolean).join(", ") || c.address || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">{fmtDate(c.createdAt)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1 items-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedClientForCredits(c)}
                          title="Facturas a Crédito (Cuentas por Cobrar)"
                          className="h-8 px-2 text-xs hover:border-[#D4AF37] hover:text-[#D4AF37]"
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1" />
                          Créditos
                          {pendingCount > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.2 bg-[#D4AF37] text-black text-[10px] font-bold rounded-full">
                              {pendingCount}
                            </span>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedClientForHistory(c)}
                          title="Historial de Ventas"
                          className="h-8 px-2 text-xs hover:border-[#D4AF37] hover:text-[#D4AF37]"
                        >
                          <History className="h-3.5 w-3.5 mr-1" />
                          Ventas
                        </Button>

                        <Button size="icon" variant="ghost" onClick={() => startEdit(c)} title="Editar" className="h-8 w-8 hover:text-[#D4AF37]">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => removeClient(c)} title="Eliminar / Desactivar" className="h-8 w-8 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Client Credits Modal */}
      <Dialog open={!!selectedClientForCredits} onOpenChange={(o) => !o && setSelectedClientForCredits(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#D4AF37]" />
              Facturas a Crédito (Cuentas por Cobrar) — {selectedClientForCredits?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Financial Summary */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-muted/30 border border-border/80 my-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">Total Créditos Ventas</div>
              <div className="text-lg font-mono font-bold text-foreground mt-1">{fmtMoney(totalCreditSales, settings.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">Total Cobrado/Pagado</div>
              <div className="text-lg font-mono font-bold text-emerald-500 mt-1">{fmtMoney(totalCreditPaid, settings.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">Saldo Pendiente</div>
              <div className="text-lg font-mono font-bold text-[#D4AF37] mt-1">{fmtMoney(totalCreditBalance, settings.currency)}</div>
            </div>
          </div>

          {/* Status Filters */}
          <div className="flex gap-2 my-2">
            {(["todas", "pendiente", "parcial", "pagada"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setCreditFilter(st)}
                className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                  creditFilter === st ? "bg-[#D4AF37] text-black" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {st === "todas" ? "Todas" : st}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Recibo Nº</th>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-right px-3 py-2.5">Pagado</th>
                  <th className="text-right px-3 py-2.5">Saldo</th>
                  <th className="text-center px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredClientCredits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay facturas a crédito registradas para este cliente.
                    </td>
                  </tr>
                ) : (
                  filteredClientCredits.map((cr) => (
                    <tr key={cr.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{cr.receiptNo}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(cr.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtMoney(cr.total, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-500">{fmtMoney(cr.paid, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#D4AF37]">{fmtMoney(cr.balance, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={cr.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {cr.balance > 0 ? (
                          <Button
                            size="sm"
                            onClick={() => openPaymentModal(cr)}
                            className="h-7 text-xs bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                          >
                            <DollarSign className="h-3 w-3 mr-1" /> Registrar Pago
                          </Button>
                        ) : (
                          <span className="text-xs text-emerald-500 font-medium inline-flex items-center">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pagada
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedClientForCredits(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Modal for Client Credit */}
      <Dialog open={!!paymentCredit} onOpenChange={(o) => { if (!o && paymentNeedsReconciliation) return; if (!o) setPaymentCredit(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#D4AF37]" />
              Registrar Pago / Abono de Cliente
            </DialogTitle>
          </DialogHeader>

          {paymentCredit && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recibo:</span>
                  <span className="font-mono font-semibold">{paymentCredit.receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total venta:</span>
                  <span className="font-mono">{fmtMoney(paymentCredit.total, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-emerald-500">
                  <span>Monto pagado previamente:</span>
                  <span className="font-mono">{fmtMoney(paymentCredit.paid, settings.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#D4AF37] pt-1 border-t border-border">
                  <span>Saldo pendiente actual:</span>
                  <span className="font-mono">{fmtMoney(paymentCredit.balance, settings.currency)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Field label="Monto a abonar/pagar">
                  <Input
                    type="number"
                    step="0.01"
                    max={paymentCredit.balance}
                    value={payAmount}
                    onChange={(e) => setPayAmount(Math.min(paymentCredit.balance, Math.max(0, +e.target.value)))}
                    className="font-mono font-bold text-lg text-[#D4AF37]"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Máximo permitido: {fmtMoney(paymentCredit.balance, settings.currency)}
                  </span>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha del cobro">
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </Field>
                  <Field label="Método de pago">
                    <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Referencia (opcional)">
                  <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Voucher #8291 / Depósito" />
                </Field>

                <Field label="Notas / Observaciones">
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Abono a la deuda recibo" />
                </Field>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentCredit(null)} disabled={pending || paymentNeedsReconciliation}>Cancelar</Button>
            {paymentNeedsReconciliation && <Button variant="outline" onClick={reconcilePayment} disabled={pending}>Consultar operaci?n</Button>}
            {paymentNeedsReconciliation && <p role="alert" className="text-sm text-destructive">No se recibi? confirmaci?n. No repitas el pago; consulta el resultado con la misma clave.</p>}
            <Button onClick={registerPayment} disabled={pending || paymentNeedsReconciliation} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
              {pending ? "Guardando…" : paymentNeedsReconciliation ? "Reconciliación requerida" : "Confirmar Cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Sales History Dialog */}
      <Dialog open={!!selectedClientForHistory} onOpenChange={(o) => !o && setSelectedClientForHistory(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#D4AF37]" />
              Historial de Ventas — {selectedClientForHistory?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Recibo Nº</th>
                  <th className="text-left px-3 py-2.5">Productos comprados</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-center px-3 py-2.5">Método</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {clientSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      No hay historial de ventas registrado para este cliente.
                    </td>
                  </tr>
                ) : (
                  clientSales.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(s.createdAt)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{s.receiptNo}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {s.lines.map((l) => `${l.quantity}x ${l.name}`).join(", ")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtMoney(s.total, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          s.paymentType === "credito"
                            ? "bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {s.paymentType === "credito" ? "Crédito" : "Contado"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedClientForHistory(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className || ""}`}><Label className="text-xs font-medium text-neutral-300">{label}</Label>{children}</div>;
}

function StatusBadge({ status }: { status: CreditStatus }) {
  switch (status) {
    case "pagada":
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Pagada</span>;
    case "parcial":
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">Parcial</span>;
    case "vencida":
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">Vencida</span>;
    case "pendiente":
    default:
      return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30">Pendiente</span>;
  }
}

import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useSupabaseTable, uid, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type {
  Supplier,
  SupplierCredit,
  CreditPayment,
  Purchase,
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
import { Plus, Pencil, Trash2, Search, CreditCard, History, DollarSign, CheckCircle2, AlertCircle, Building2, Filter } from "lucide-react";
import { toast } from "sonner";
import { PersistenceError, userPersistenceMessage } from "@/lib/persistence.js";
import { getConfirmedBusinessOperation, postBusinessOperation } from "@/lib/businessOperations";

export const Route = createFileRoute("/_app/suppliers")({
  component: SuppliersPage,
});

const emptySupplier: Omit<Supplier, "id" | "createdAt"> = {
  rnc: "",
  name: "",
  contactName: "",
  phone: "",
  phoneSecondary: "",
  email: "",
  province: "Santo Domingo",
  city: "Santo Domingo",
  address: "",
  notes: "",
  status: "activo",
};

function SuppliersPage() {
  const { data: suppliers, insert, update, remove } = useSupabaseTable<Supplier>("suppliers");
  const { data: credits, refresh: refreshCredits } = useSupabaseTable<SupplierCredit>("supplier_credits");
  const { data: payments, refresh: refreshPayments } = useSupabaseTable<CreditPayment>("credit_payments");
  const { data: purchases } = useSupabaseTable<Purchase>("purchases");
  const [settings] = useSettings();
  const paymentRequestKey = useRef<string | null>(null);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptySupplier);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activo" | "inactivo">("todos");

  // Modals for Credit & History
  const [selectedSupplierForCredits, setSelectedSupplierForCredits] = useState<Supplier | null>(null);
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<Supplier | null>(null);
  const [creditFilter, setCreditFilter] = useState<"todas" | "pendiente" | "parcial" | "pagada">("todas");

  // Payment registration state
  const [paymentCredit, setPaymentCredit] = useState<SupplierCredit | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("transferencia");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [pending, setPending] = useState(false);
  const [paymentNeedsReconciliation, setPaymentNeedsReconciliation] = useState(false);

  const startNew = () => {
    setEditing(null);
    setForm(emptySupplier);
    setOpenForm(true);
  };

  const startEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ ...emptySupplier, ...s });
    setOpenForm(true);
  };

  const saveSupplier = async () => {
    if (pending) return;
    if (!form.name.trim()) {
      toast.error("El nombre / razón social es obligatorio");
      return;
    }
    setPending(true);
    try {
      if (editing) {
        await update(editing.id, form);
        toast.success("Proveedor actualizado");
      } else {
        await insert({ id: uid(), createdAt: new Date().toISOString(), ...form });
        toast.success("Proveedor registrado");
      }
      setOpenForm(false);
    } catch (e) {
      toast.error(userPersistenceMessage(e));
    } finally {
      setPending(false);
    }
  };

  const deleteSupplier = async (s: Supplier) => {
    // Check if supplier has credit invoices or purchases
    const hasPurchases = purchases.some((p) => p.supplierId === s.id || p.supplier.toLowerCase() === s.name.toLowerCase());
    const hasCredits = credits.some((c) => c.supplierId === s.id || c.supplierName.toLowerCase() === s.name.toLowerCase());

    if (hasPurchases || hasCredits) {
      if (confirm(`El proveedor "${s.name}" tiene historial de compras o créditos asociados. ¿Deseas desactivarlo para no perder datos históricos?`)) {
        try {
          await update(s.id, { status: "inactivo" });
          toast.success("Proveedor marcado como Inactivo");
        } catch (error) {
          toast.error(userPersistenceMessage(error));
        }
      }
      return;
    }

    if (!confirm(`¿Eliminar permanentemente al proveedor "${s.name}"?`)) return;
    try {
      await remove(s.id);
      toast.success("Proveedor eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const openPaymentModal = (credit: SupplierCredit) => {
    setPaymentNeedsReconciliation(false);
    setPaymentCredit(credit);
    setPayAmount(credit.balance);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod("transferencia");
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
      await postBusinessOperation("supplier_payment", {
        idempotency_key: idempotencyKey, credit_type: "supplier", credit_id: paymentCredit.id,
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
      const result = await getConfirmedBusinessOperation("supplier_payment", key);
      if (!result) { toast.error("El pago todav?a no aparece confirmado. Conserva la operaci?n y vuelve a consultar."); return; }
      paymentRequestKey.current = null; setPaymentNeedsReconciliation(false);
      void refreshCredits(); void refreshPayments();
      toast.success("Pago confirmado y reconciliado"); setPaymentCredit(null);
    } catch (error) { toast.error(userPersistenceMessage(error)); }
    finally { setPending(false); }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const matchesQuery = [s.name, s.rnc, s.contactName, s.phone, s.city, s.province]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase());
    const matchesStatus = statusFilter === "todos" || (s.status || "activo") === statusFilter;
    return matchesQuery && matchesStatus;
  });

  // Calculate credits for selected supplier
  const supplierCredits = selectedSupplierForCredits
    ? credits.filter(
        (c) =>
          c.supplierId === selectedSupplierForCredits.id ||
          c.supplierName.toLowerCase() === selectedSupplierForCredits.name.toLowerCase()
      )
    : [];

  const totalCreditPurchases = supplierCredits.filter((c) => c.status !== "anulada").reduce((acc, c) => acc + c.total, 0);
  const totalCreditPaid = supplierCredits.reduce((acc, c) => acc + c.paid, 0);
  const totalCreditBalance = supplierCredits.reduce((acc, c) => acc + c.balance, 0);

  const filteredCredits = supplierCredits.filter((c) => {
    if (creditFilter === "todas") return true;
    return c.status === creditFilter;
  });

  // Calculate purchase history for selected supplier
  const supplierPurchases = selectedSupplierForHistory
    ? purchases.filter(
        (p) =>
          p.supplierId === selectedSupplierForHistory.id ||
          p.supplier.toLowerCase() === selectedSupplierForHistory.name.toLowerCase()
      )
    : [];

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description="Gestión de distribuidores, facturas a crédito (cuentas por pagar) e historial de compras."
        actions={
          <Dialog open={openForm} onOpenChange={setOpenForm}>
            <DialogTrigger asChild>
              <Button onClick={startNew} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                <Plus className="h-4 w-4 mr-1.5" /> Nuevo proveedor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="RNC / Identificación">
                    <Input value={form.rnc} onChange={(e) => setForm({ ...form, rnc: e.target.value })} placeholder="131-00000-1" />
                  </Field>
                  <Field label="Razón Social / Nombre">
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Grace Barber Supplies S.R.L." />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Persona de Contacto">
                    <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Carlos Mendoza" />
                  </Field>
                  <Field label="Estado">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "activo" | "inactivo" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Teléfono Principal">
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="809-555-0199" />
                  </Field>
                  <Field label="Teléfono Secundario">
                    <Input value={form.phoneSecondary || ""} onChange={(e) => setForm({ ...form, phoneSecondary: e.target.value })} placeholder="809-555-0122" />
                  </Field>
                </div>

                <Field label="Correo Electrónico">
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ventas@gracebarber.com" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Provincia">
                    <Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Santo Domingo" />
                  </Field>
                  <Field label="Ciudad / Municipio">
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Santo Domingo Este" />
                  </Field>
                </div>

                <Field label="Dirección Física">
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Av. Winston Churchill #102, Plaza Grace" />
                </Field>

                <Field label="Notas u Observaciones">
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Proveedor principal de ceras mate, tijeras de titanio y trimmers Wahl." />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenForm(false)} disabled={pending}>Cancelar</Button>
                <Button onClick={saveSupplier} disabled={pending} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                  {pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar proveedor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por RNC, nombre, contacto, teléfono…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="inactivo">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            <tr>
              <th className="text-left px-4 py-3.5">RNC</th>
              <th className="text-left px-4 py-3.5">Proveedor</th>
              <th className="text-left px-4 py-3.5">Contacto</th>
              <th className="text-left px-4 py-3.5">Teléfono / Correo</th>
              <th className="text-left px-4 py-3.5">Ubicación</th>
              <th className="text-center px-4 py-3.5">Estado</th>
              <th className="px-4 py-3.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  No hay proveedores registrados que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((s) => {
                const pendingCount = credits.filter(
                  (c) => (c.supplierId === s.id || c.supplierName.toLowerCase() === s.name.toLowerCase()) && c.balance > 0
                ).length;

                return (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-muted-foreground">{s.rnc || "N/A"}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-[#D4AF37]" />
                        {s.name}
                      </div>
                      {s.notes && <div className="text-xs text-muted-foreground truncate max-w-xs">{s.notes}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground font-medium">{s.contactName || "—"}</td>
                    <td className="px-4 py-3.5 text-xs">
                      <div>{s.phone}</div>
                      <div className="text-muted-foreground text-[11px]">{s.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {[s.city, s.province].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                        s.status === "inactivo"
                          ? "bg-muted text-muted-foreground"
                          : "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30"
                      }`}>
                        {s.status === "inactivo" ? "Inactivo" : "Activo"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1 items-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedSupplierForCredits(s)}
                          title="Facturas a crédito (Cuentas por Pagar)"
                          className="h-8 px-2 text-xs relative hover:border-[#D4AF37] hover:text-[#D4AF37]"
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
                          onClick={() => setSelectedSupplierForHistory(s)}
                          title="Historial de compras"
                          className="h-8 px-2 text-xs hover:border-[#D4AF37] hover:text-[#D4AF37]"
                        >
                          <History className="h-3.5 w-3.5 mr-1" />
                          Historial
                        </Button>

                        <Button size="icon" variant="ghost" onClick={() => startEdit(s)} title="Editar" className="h-8 w-8 hover:text-[#D4AF37]">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteSupplier(s)} title="Eliminar / Desactivar" className="h-8 w-8 hover:text-destructive">
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

      {/* Supplier Credit Invoices Dialog */}
      <Dialog open={!!selectedSupplierForCredits} onOpenChange={(o) => !o && setSelectedSupplierForCredits(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#D4AF37]" />
              Facturas a Crédito — {selectedSupplierForCredits?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Financial Summary */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-muted/30 border border-border/80 my-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">Total Compras a Crédito</div>
              <div className="text-lg font-mono font-bold text-foreground mt-1">{fmtMoney(totalCreditPurchases, settings.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">Total Pagado</div>
              <div className="text-lg font-mono font-bold text-emerald-500 mt-1">{fmtMoney(totalCreditPaid, settings.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">Saldo Pendiente</div>
              <div className="text-lg font-mono font-bold text-[#D4AF37] mt-1">{fmtMoney(totalCreditBalance, settings.currency)}</div>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-2 my-2">
            {(["todas", "pendiente", "parcial", "pagada"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setCreditFilter(st)}
                className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                  creditFilter === st
                    ? "bg-[#D4AF37] text-black"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {st === "todas" ? "Todas" : st}
              </button>
            ))}
          </div>

          {/* Credits Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Factura Nº</th>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-right px-3 py-2.5">Pagado</th>
                  <th className="text-right px-3 py-2.5">Saldo</th>
                  <th className="text-center px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCredits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay facturas a crédito registradas para este proveedor.
                    </td>
                  </tr>
                ) : (
                  filteredCredits.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{c.invoiceNo}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(c.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtMoney(c.total, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-500">{fmtMoney(c.paid, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#D4AF37]">{fmtMoney(c.balance, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {c.balance > 0 ? (
                          <Button
                            size="sm"
                            onClick={() => openPaymentModal(c)}
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
            <Button variant="outline" onClick={() => setSelectedSupplierForCredits(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Registration Modal */}
      <Dialog open={!!paymentCredit} onOpenChange={(o) => { if (!o && paymentNeedsReconciliation) return; if (!o) setPaymentCredit(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#D4AF37]" />
              Registrar Pago a Proveedor
            </DialogTitle>
          </DialogHeader>

          {paymentCredit && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Factura:</span>
                  <span className="font-mono font-semibold">{paymentCredit.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Proveedor:</span>
                  <span className="font-medium">{paymentCredit.supplierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total compra:</span>
                  <span className="font-mono">{fmtMoney(paymentCredit.total, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-emerald-500">
                  <span>Monto pagado:</span>
                  <span className="font-mono">{fmtMoney(paymentCredit.paid, settings.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#D4AF37] pt-1 border-t border-border">
                  <span>Saldo pendiente:</span>
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
                  <Field label="Fecha del pago">
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </Field>
                  <Field label="Método de pago">
                    <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Referencia (Nº Transferencia/Comprobante)">
                  <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="TR-940291" />
                </Field>

                <Field label="Notas / Observaciones">
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Abono parcial correspondiente a la factura" />
                </Field>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentCredit(null)} disabled={pending || paymentNeedsReconciliation}>Cancelar</Button>
            {paymentNeedsReconciliation && <Button variant="outline" onClick={reconcilePayment} disabled={pending}>Consultar operaci?n</Button>}
            {paymentNeedsReconciliation && <p role="alert" className="text-sm text-destructive">No se recibi? confirmaci?n. No repitas el pago; consulta el resultado con la misma clave.</p>}
            <Button onClick={registerPayment} disabled={pending || paymentNeedsReconciliation} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
              {pending ? "Guardando…" : paymentNeedsReconciliation ? "Reconciliación requerida" : "Confirmar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Purchase History Dialog */}
      <Dialog open={!!selectedSupplierForHistory} onOpenChange={(o) => !o && setSelectedSupplierForHistory(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#D4AF37]" />
              Historial de Compras — {selectedSupplierForHistory?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Factura / ID</th>
                  <th className="text-left px-3 py-2.5">Producto / Descripción</th>
                  <th className="text-right px-3 py-2.5">Cant.</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-center px-3 py-2.5">Método</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {supplierPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No hay compras registradas con este proveedor.
                    </td>
                  </tr>
                ) : (
                  supplierPurchases.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(p.createdAt)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{p.invoiceNo || p.id.slice(0, 8)}</td>
                      <td className="px-3 py-2.5 text-xs">{p.description}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{p.quantity}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtMoney(p.total, settings.currency)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          p.paymentType === "credito"
                            ? "bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {p.paymentType === "credito" ? "Crédito" : "Contado"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSupplierForHistory(null)}>Cerrar</Button>
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

import { createFileRoute } from "@tanstack/react-router";
import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  CreditCard,
  History,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Building2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { PersistenceError, userPersistenceMessage } from "@/lib/persistence.js";
import { getConfirmedBusinessOperation, postBusinessOperation } from "@/lib/businessOperations";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { UUID } from "@/lib/database.types";
import {
  clearPendingCreditPayment,
  formatMoneyFromCents,
  localDateInDominicanRepublic,
  matchesLegacySupplierName,
  parseMoneyToCents,
  persistPendingCreditPayment,
  readPendingCreditPayment,
  summarizeCredits,
  validatePartyForm,
  type CreditPaymentOperation,
} from "@/lib/creditWorkflows.js";

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
  const { user, can } = useAuth();
  const canViewPurchases = can("purchases") || can("suppliers");
  const suppliersTable = useSupabaseTable<Supplier>("suppliers");
  const { data: suppliers, insert, update, remove } = suppliersTable;
  const creditsTable = useSupabaseTable<SupplierCredit>(
    "supplier_credits",
    "created_at",
    false,
    "*",
    canViewPurchases,
  );
  const { data: credits, refresh: refreshCredits } = creditsTable;
  const paymentsTable = useSupabaseTable<CreditPayment>(
    "credit_payments",
    "created_at",
    false,
    "*",
    canViewPurchases,
  );
  const { data: payments, refresh: refreshPayments } = paymentsTable;
  const purchasesTable = useSupabaseTable<Purchase>(
    "purchases",
    "created_at",
    false,
    "*",
    canViewPurchases,
  );
  const { data: purchases } = purchasesTable;
  const [settings] = useSettings();
  const paymentInFlight = useRef(false);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptySupplier);
  const [formErrors, setFormErrors] = useState<Partial<Record<"name" | "email", string>>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "rejected">("idle");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activo" | "inactivo">("todos");
  const [partyToRemove, setPartyToRemove] = useState<Supplier | null>(null);

  // Modals for Credit & History
  const [selectedSupplierForCredits, setSelectedSupplierForCredits] = useState<Supplier | null>(
    null,
  );
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<Supplier | null>(
    null,
  );
  const [creditFilter, setCreditFilter] = useState<"todas" | CreditStatus>("todas");

  // Payment registration state
  const [paymentCredit, setPaymentCredit] = useState<SupplierCredit | null>(null);
  const [payAmount, setPayAmount] = useState<string>("0");
  const [payDate, setPayDate] = useState<string>(localDateInDominicanRepublic());
  const [payMethod, setPayMethod] = useState<PaymentMethod>("transferencia");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [pending, setPending] = useState(false);
  const [paymentNeedsReconciliation, setPaymentNeedsReconciliation] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<CreditPaymentOperation | null>(null);
  const [pendingPaymentError, setPendingPaymentError] = useState<string | null>(null);
  const [paymentRecoveryLoaded, setPaymentRecoveryLoaded] = useState(false);
  const partySaveInFlight = useRef(false);
  const partyActionInFlight = useRef(false);

  useEffect(() => {
    try {
      setPendingPayment(readPendingCreditPayment(window.sessionStorage));
      setPendingPaymentError(null);
    } catch (error) {
      setPendingPaymentError(
        error instanceof Error ? error.message : "No se pudo recuperar el pago pendiente.",
      );
    } finally {
      setPaymentRecoveryLoaded(true);
    }
  }, [user?.authUserId]);

  useEffect(() => {
    if (
      !pendingPayment ||
      pendingPayment.operation !== "supplier_payment" ||
      pendingPayment.actorId !== user?.authUserId
    )
      return;
    const credit = credits.find((item) => item.id === pendingPayment.creditId);
    if (!credit) return;
    setPaymentCredit(credit);
    setPayAmount(pendingPayment.request.amount);
    setPayDate(String(pendingPayment.request.date ?? localDateInDominicanRepublic()));
    setPayMethod(String(pendingPayment.request.method ?? "transferencia") as PaymentMethod);
    setPayRef(String(pendingPayment.request.reference ?? ""));
    setPayNote(String(pendingPayment.request.note ?? ""));
    setPaymentNeedsReconciliation(true);
  }, [pendingPayment, user?.authUserId, credits]);

  const startNew = () => {
    setEditing(null);
    setForm(emptySupplier);
    setFormErrors({});
    setSaveState("idle");
    setOpenForm(true);
  };

  const startEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ ...emptySupplier, ...s });
    setFormErrors({});
    setSaveState("idle");
    setOpenForm(true);
  };

  const saveSupplier = async () => {
    if (pending || partySaveInFlight.current) return;
    const errors = validatePartyForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveState("rejected");
      return;
    }
    partySaveInFlight.current = true;
    setPending(true);
    setSaveState("saving");
    try {
      if (editing) {
        await update(editing.id, form);
        toast.success("Proveedor actualizado");
      } else {
        await insert({ id: uid(), createdAt: new Date().toISOString(), ...form });
        toast.success("Proveedor registrado");
      }
      setOpenForm(false);
      setSaveState("saved");
    } catch (e) {
      setSaveState("rejected");
      toast.error(userPersistenceMessage(e));
    } finally {
      partySaveInFlight.current = false;
      setPending(false);
    }
  };

  const supplierHasHistory = (supplier: Supplier) =>
    purchases.some((purchase) =>
      matchesLegacySupplierName(purchase.supplierId, purchase.supplier, supplier, suppliers),
    ) ||
    credits.some((credit) =>
      matchesLegacySupplierName(credit.supplierId, credit.supplierName, supplier, suppliers),
    );
  const historyCheckReady =
    canViewPurchases &&
    !purchasesTable.loading &&
    !purchasesTable.stale &&
    !purchasesTable.loadError &&
    !creditsTable.loading &&
    !creditsTable.stale &&
    !creditsTable.loadError;
  const partyHasHistory = Boolean(partyToRemove && supplierHasHistory(partyToRemove));
  const deleteSupplier = (supplier: Supplier) => setPartyToRemove(supplier);

  const confirmRemoveSupplier = async (deactivate: boolean) => {
    const supplier = partyToRemove;
    if (
      !supplier ||
      pending ||
      partyActionInFlight.current ||
      (!deactivate && (!historyCheckReady || partyHasHistory))
    )
      return;
    partyActionInFlight.current = true;
    setPending(true);
    try {
      if (deactivate) {
        await update(supplier.id, { status: "inactivo" });
        toast.success("Proveedor desactivado; su historial se conserva.");
      } else {
        await remove(supplier.id);
        toast.success("Proveedor eliminado");
      }
      setPartyToRemove(null);
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      partyActionInFlight.current = false;
      setPending(false);
    }
  };
  const openPaymentModal = (credit: SupplierCredit) => {
    if (!paymentRecoveryLoaded || pendingPayment || pendingPaymentError) return;
    setPaymentNeedsReconciliation(false);
    setPaymentCredit(credit);
    setPayAmount(formatMoneyFromCents(parseMoneyToCents(credit.balance) ?? 0));
    setPayDate(localDateInDominicanRepublic());
    setPayMethod("transferencia");
    setPayRef("");
    setPayNote("");
  };

  const finishPayment = async (operation: CreditPaymentOperation) => {
    clearPendingCreditPayment(window.sessionStorage, operation.idempotencyKey);
    setPendingPayment(null);
    setPendingPaymentError(null);
    setPaymentNeedsReconciliation(false);
    void refreshCredits();
    void refreshPayments();
    toast.success("Pago confirmado y conciliado");
    setPaymentCredit(null);
  };

  const registerPayment = async () => {
    if (
      !paymentRecoveryLoaded ||
      pending ||
      paymentInFlight.current ||
      paymentNeedsReconciliation ||
      !paymentCredit ||
      pendingPayment ||
      pendingPaymentError
    )
      return;
    const amountCents = parseMoneyToCents(payAmount);
    if (amountCents === null || amountCents <= 0) {
      toast.error("Escribe un monto mayor que cero con hasta 2 decimales.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
      toast.error("Selecciona una fecha válida.");
      return;
    }
    paymentInFlight.current = true;
    setPending(true);
    let operationPersisted = false;
    try {
      const { data: currentCredit, error } = await supabase
        .from("supplier_credits")
        .select("balance,status")
        .eq("id", paymentCredit.id as UUID)
        .maybeSingle();
      if (error) throw error;
      if (
        !currentCredit ||
        currentCredit.status === "anulada" ||
        Number(currentCredit.balance) <= 0
      )
        throw new Error(
          "Esta deuda ya no tiene saldo pagable. Actualiza la cuenta antes de continuar.",
        );
      const balanceCents = parseMoneyToCents(String(currentCredit.balance));
      if (balanceCents === null || amountCents > balanceCents)
        throw new Error(
          "El saldo cambió y ya no cubre este monto. Actualiza la cuenta antes de continuar.",
        );
      const idempotencyKey = globalThis.crypto.randomUUID();
      const operation: CreditPaymentOperation = {
        actorId: user?.authUserId ?? "",
        operation: "supplier_payment",
        creditType: "supplier",
        creditId: paymentCredit.id,
        idempotencyKey,
        request: {
          idempotency_key: idempotencyKey,
          credit_type: "supplier",
          credit_id: paymentCredit.id,
          amount: `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, "0")}`,
          date: payDate,
          method: payMethod,
          reference: payRef || null,
          note: payNote || null,
        },
      };
      if (!operation.actorId)
        throw new Error("No se pudo verificar la sesión para registrar el pago.");
      persistPendingCreditPayment(window.sessionStorage, operation);
      operationPersisted = true;
      setPendingPayment(operation);
      await postBusinessOperation("supplier_payment", operation.request);
      await finishPayment(operation);
    } catch (error) {
      if (
        operationPersisted &&
        error instanceof PersistenceError &&
        ["validation", "denied", "conflict", "not_found"].includes(error.kind)
      ) {
        const saved = readPendingCreditPayment(window.sessionStorage);
        if (saved) clearPendingCreditPayment(window.sessionStorage, saved.idempotencyKey);
        setPendingPayment(null);
        setPaymentNeedsReconciliation(false);
      } else if (operationPersisted) setPaymentNeedsReconciliation(true);
      toast.error(userPersistenceMessage(error));
    } finally {
      paymentInFlight.current = false;
      setPending(false);
    }
  };

  const reconcilePayment = async () => {
    const operation = pendingPayment;
    if (!operation || pending || paymentInFlight.current) return;
    if (operation.actorId !== user?.authUserId) {
      toast.error("Inicia sesión con la cuenta que inició este pago para conciliarlo.");
      return;
    }
    paymentInFlight.current = true;
    setPending(true);
    try {
      const result = await getConfirmedBusinessOperation(
        "supplier_payment",
        operation.idempotencyKey,
      );
      if (result) {
        await finishPayment(operation);
        return;
      }
      const retried = await postBusinessOperation("supplier_payment", operation.request);
      if (retried) await finishPayment(operation);
    } catch (error) {
      const failure = error instanceof PersistenceError ? error.kind : "uncertain";
      if (["validation", "denied", "conflict", "not_found"].includes(failure)) {
        clearPendingCreditPayment(window.sessionStorage, operation.idempotencyKey);
        setPendingPayment(null);
        setPaymentNeedsReconciliation(false);
      }
      toast.error(userPersistenceMessage(error));
    } finally {
      paymentInFlight.current = false;
      setPending(false);
    }
  };
  const filteredSuppliers = suppliers.filter((s) => {
    const matchesQuery = [
      s.name,
      s.rnc,
      s.contactName,
      s.phone,
      s.phoneSecondary,
      s.email,
      s.city,
      s.province,
      s.address,
      s.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-DO")
      .includes(q.trim().toLocaleLowerCase("es-DO"));
    const matchesStatus = statusFilter === "todos" || (s.status || "activo") === statusFilter;
    return matchesQuery && matchesStatus;
  });

  // Calculate credits for selected supplier
  const supplierCredits = selectedSupplierForCredits
    ? credits.filter((credit) =>
        matchesLegacySupplierName(
          credit.supplierId,
          credit.supplierName,
          selectedSupplierForCredits,
          suppliers,
        ),
      )
    : [];

  const supplierCreditSummary = summarizeCredits(supplierCredits);
  const totalCreditPurchases = supplierCreditSummary.original;
  const totalCreditPaid = supplierCreditSummary.paid;
  const totalCreditBalance = supplierCreditSummary.balance;

  const filteredCredits = supplierCredits.filter((c) => {
    if (creditFilter === "todas") return true;
    return c.status === creditFilter;
  });

  // Calculate purchase history for selected supplier
  const supplierPurchases = selectedSupplierForHistory
    ? purchases.filter((p) =>
        matchesLegacySupplierName(p.supplierId, p.supplier, selectedSupplierForHistory, suppliers),
      )
    : [];

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description="Gestión de distribuidores, facturas a crédito (cuentas por pagar) e historial de compras."
        actions={
          <Dialog
            open={openForm}
            onOpenChange={(open) => {
              if (!pending) setOpenForm(open);
            }}
          >
            <DialogTrigger asChild>
              <Button
                onClick={startNew}
                className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
              >
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
                    <Input
                      value={form.rnc}
                      onChange={(e) => setForm({ ...form, rnc: e.target.value })}
                      placeholder="Identificación (opcional)"
                    />
                  </Field>
                  <Field
                    label="Razón social o nombre"
                    error={formErrors.name}
                    htmlFor="supplier-name"
                  >
                    <Input
                      id="supplier-name"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(formErrors.name)}
                      aria-describedby={formErrors.name ? "supplier-name-error" : undefined}
                      value={form.name}
                      onChange={(e) => {
                        setForm({ ...form, name: e.target.value });
                        setFormErrors({ ...formErrors, name: undefined });
                      }}
                      placeholder="Nombre del negocio o proveedor"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Persona de Contacto">
                    <Input
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                      placeholder="Carlos Mendoza"
                    />
                  </Field>
                  <Field label="Estado">
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setForm({ ...form, status: v as "activo" | "inactivo" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Teléfono Principal">
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="809-555-0199"
                    />
                  </Field>
                  <Field label="Teléfono Secundario">
                    <Input
                      type="tel"
                      value={form.phoneSecondary || ""}
                      onChange={(e) => setForm({ ...form, phoneSecondary: e.target.value })}
                      placeholder="809-555-0122"
                    />
                  </Field>
                </div>

                <Field label="Correo electrónico" error={formErrors.email} htmlFor="supplier-email">
                  <Input
                    id="supplier-email"
                    type="email"
                    aria-invalid={Boolean(formErrors.email)}
                    aria-describedby={formErrors.email ? "supplier-email-error" : undefined}
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setFormErrors({ ...formErrors, email: undefined });
                    }}
                    placeholder="nombre@ejemplo.com"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Provincia">
                    <Input
                      value={form.province}
                      onChange={(e) => setForm({ ...form, province: e.target.value })}
                      placeholder="Santo Domingo"
                    />
                  </Field>
                  <Field label="Ciudad / Municipio">
                    <Input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="Santo Domingo Este"
                    />
                  </Field>
                </div>

                <Field label="Dirección Física">
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Av. Winston Churchill #102, Plaza Grace"
                  />
                </Field>

                <Field label="Notas u Observaciones">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Proveedor principal de ceras mate, tijeras de titanio y trimmers Wahl."
                  />
                </Field>
              </div>
              {saveState === "saving" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Guardando proveedor…
                </p>
              )}
              {saveState === "rejected" && (
                <p role="alert" className="text-sm text-destructive">
                  No se guardó el proveedor. Revisa los campos y vuelve a intentarlo; la información
                  escrita sigue disponible.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenForm(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button
                  onClick={saveSupplier}
                  disabled={pending}
                  className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                >
                  {pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar proveedor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {pendingPaymentError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {pendingPaymentError}
        </div>
      )}
      {pendingPayment && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <span>
            {pendingPayment.actorId === user?.authUserId &&
            pendingPayment.operation === "supplier_payment"
              ? "Hay un pago a proveedor pendiente de conciliación. No inicies otro pago hasta resolverlo."
              : "Hay una operación financiera pendiente en otra sesión o módulo. Inicia sesión con su usuario y continúa en su módulo para conciliarla."}
          </span>
          {pendingPayment.actorId === user?.authUserId &&
            pendingPayment.operation === "supplier_payment" && (
              <Button variant="outline" onClick={reconcilePayment} disabled={pending}>
                Consultar y reintentar la misma operación
              </Button>
            )}
        </div>
      )}
      {suppliersTable.loadError && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm"
        >
          <span>No se pudo cargar la lista: {suppliersTable.loadError}</span>
          <Button variant="outline" onClick={() => void suppliersTable.refresh()}>
            Reintentar
          </Button>
        </div>
      )}
      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar proveedores"
            placeholder="Buscar por RNC, nombre, contacto, teléfono…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
          >
            <SelectTrigger aria-label="Filtrar proveedores por estado" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="inactivo">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Suppliers Table */}
      <div
        role="region"
        aria-label="Lista de proveedores; desplázate horizontalmente para ver todas las columnas"
        tabIndex={0}
        className="rounded-xl border border-border bg-card overflow-x-auto shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full min-w-[960px] text-sm">
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
            {suppliersTable.loading && suppliers.length === 0 ? (
              <tr>
                <td colSpan={7} role="status" className="text-center py-12 text-muted-foreground">
                  Cargando proveedores…
                </td>
              </tr>
            ) : suppliersTable.loadError && suppliers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  No se muestran resultados hasta recuperar la lista.
                </td>
              </tr>
            ) : filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  {q || statusFilter !== "todos"
                    ? "No hay proveedores que coincidan con la búsqueda y el estado."
                    : "Aún no hay proveedores registrados."}
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((s) => {
                const pendingCount = credits.filter(
                  (c) =>
                    matchesLegacySupplierName(c.supplierId, c.supplierName, s, suppliers) &&
                    c.status !== "anulada" &&
                    c.balance > 0,
                ).length;

                return (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-muted-foreground">
                      {s.rnc || "N/A"}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-[#D4AF37]" />
                        {s.name}
                      </div>
                      {s.notes && (
                        <div className="text-xs text-muted-foreground truncate max-w-xs">
                          {s.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground font-medium">
                      {s.contactName || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div>{s.phone}</div>
                      <div className="text-muted-foreground text-[11px]">{s.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {[s.city, s.province].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                          s.status === "inactivo"
                            ? "bg-muted text-muted-foreground"
                            : "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30"
                        }`}
                      >
                        {s.status === "inactivo" ? "Inactivo" : "Activo"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-wrap justify-end gap-1 items-center">
                        {canViewPurchases && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedSupplierForCredits(s)}
                              aria-label={`Ver créditos de ${s.name}`}
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
                              aria-label={`Ver compras de ${s.name}`}
                              title="Historial de compras"
                              className="h-8 px-2 text-xs hover:border-[#D4AF37] hover:text-[#D4AF37]"
                            >
                              <History className="h-3.5 w-3.5 mr-1" />
                              Historial
                            </Button>
                          </>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(s)}
                          aria-label={`Editar proveedor ${s.name}`}
                          className="h-8 px-2 hover:text-[#D4AF37]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteSupplier(s)}
                          aria-label={`Desactivar o eliminar proveedor ${s.name}`}
                          className="h-8 px-2 hover:text-destructive"
                        >
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
      <Dialog
        open={!!selectedSupplierForCredits}
        onOpenChange={(o) => !o && setSelectedSupplierForCredits(null)}
      >
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
              <div className="text-xs uppercase text-muted-foreground font-medium">
                Total Compras a Crédito
              </div>
              <div className="text-lg font-mono font-bold text-foreground mt-1">
                {fmtMoney(totalCreditPurchases, settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">
                Total Pagado
              </div>
              <div className="text-lg font-mono font-bold text-emerald-500 mt-1">
                {fmtMoney(totalCreditPaid, settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">
                Saldo Pendiente
              </div>
              <div className="text-lg font-mono font-bold text-[#D4AF37] mt-1">
                {fmtMoney(totalCreditBalance, settings.currency)}
              </div>
            </div>
          </div>

          {/* Status filter tabs */}
          {creditsTable.loadError && (
            <div
              role="alert"
              className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm"
            >
              <span>No se pudo actualizar la cuenta: {creditsTable.loadError}</span>
              <Button variant="outline" onClick={() => void refreshCredits()}>
                Reintentar
              </Button>
            </div>
          )}
          <div className="my-2 flex flex-wrap gap-2" aria-label="Filtrar créditos por estado">
            {(["todas", "pendiente", "parcial", "pagada", "vencida", "anulada"] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  aria-pressed={creditFilter === st}
                  onClick={() => setCreditFilter(st)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                    creditFilter === st
                      ? "bg-[#D4AF37] text-black"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {st === "todas" ? "Todas" : st}
                </button>
              ),
            )}
          </div>

          {/* Credits Table */}
          <div
            role="region"
            aria-label="Créditos del proveedor"
            tabIndex={0}
            className="rounded-lg border border-border overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[760px] text-sm">
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
                {creditsTable.loading && credits.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      role="status"
                      className="text-center py-8 text-muted-foreground"
                    >
                      Cargando créditos…
                    </td>
                  </tr>
                ) : filteredCredits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay facturas a crédito registradas para este proveedor.
                    </td>
                  </tr>
                ) : (
                  filteredCredits.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{c.invoiceNo}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDate(c.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {fmtMoney(c.total, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-500">
                        {fmtMoney(c.paid, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#D4AF37]">
                        {fmtMoney(c.balance, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {c.status !== "anulada" && c.balance > 0 ? (
                          <Button
                            size="sm"
                            onClick={() => openPaymentModal(c)}
                            disabled={
                              !paymentRecoveryLoaded ||
                              Boolean(pendingPayment) ||
                              Boolean(pendingPaymentError) ||
                              pending
                            }
                            className="h-7 text-xs bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                          >
                            <DollarSign className="h-3 w-3 mr-1" /> Registrar Pago
                          </Button>
                        ) : (
                          <span className="text-xs text-emerald-500 font-medium inline-flex items-center">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{" "}
                            {c.status === "anulada" ? "Anulada" : "Pagada"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {paymentsTable.loadError ? (
            <div role="alert" className="my-4 rounded-md border border-destructive/40 p-3 text-sm">
              No se pudo cargar el historial de pagos.{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => void refreshPayments()}>
                Reintentar
              </Button>
            </div>
          ) : (
            <section aria-labelledby="supplier-payment-history-title" className="mt-4">
              <h3 id="supplier-payment-history-title" className="mb-2 text-sm font-semibold">
                Movimientos de pago
              </h3>
              <div
                role="region"
                aria-label="Movimientos de pago del proveedor"
                tabIndex={0}
                className="rounded-lg border border-border overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Factura</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Método / referencia</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                      <th className="px-3 py-2 text-left">Estado del documento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {(() => {
                      const creditById = new Map(
                        supplierCredits.map((credit) => [credit.id, credit]),
                      );
                      const movements = payments.filter(
                        (payment) =>
                          "supplierCreditId" in payment &&
                          payment.supplierCreditId !== undefined &&
                          creditById.has(payment.supplierCreditId),
                      );
                      if (movements.length === 0)
                        return (
                          <tr>
                            <td colSpan={5} className="py-5 text-center text-muted-foreground">
                              Aún no hay pagos registrados para estos créditos.
                            </td>
                          </tr>
                        );
                      return movements.map((payment) => {
                        const credit =
                          "supplierCreditId" in payment && payment.supplierCreditId
                            ? creditById.get(payment.supplierCreditId)
                            : undefined;
                        return (
                          <tr key={payment.id}>
                            <td className="px-3 py-2 font-mono">{credit?.invoiceNo}</td>
                            <td className="px-3 py-2">{fmtDate(payment.date)}</td>
                            <td className="px-3 py-2">
                              {payment.method}
                              {payment.reference ? ` · ${payment.reference}` : ""}
                              {payment.note ? (
                                <div className="text-xs text-muted-foreground">{payment.note}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {fmtMoney(payment.amount, settings.currency)}
                            </td>
                            <td className="px-3 py-2">
                              {credit?.status === "anulada"
                                ? "Crédito anulado; movimiento conservado"
                                : "Registrado"}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSupplierForCredits(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Registration Modal */}
      <Dialog
        open={!!paymentCredit}
        onOpenChange={(o) => {
          if (!o) setPaymentCredit(null);
        }}
      >
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
                  <span className="font-mono">
                    {fmtMoney(paymentCredit.total, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-500">
                  <span>Monto pagado:</span>
                  <span className="font-mono">
                    {fmtMoney(paymentCredit.paid, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-[#D4AF37] pt-1 border-t border-border">
                  <span>Saldo pendiente:</span>
                  <span className="font-mono">
                    {fmtMoney(paymentCredit.balance, settings.currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Field label="Monto a abonar/pagar">
                  <Input
                    type="number"
                    step="0.01"
                    max={paymentCredit.balance}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    disabled={paymentNeedsReconciliation}
                    aria-label="Monto del pago"
                    className="font-mono font-bold text-lg text-[#D4AF37]"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Máximo permitido: {fmtMoney(paymentCredit.balance, settings.currency)}
                  </span>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha del pago">
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      disabled={paymentNeedsReconciliation}
                    />
                  </Field>
                  <Field label="Método de pago">
                    <Select
                      value={payMethod}
                      onValueChange={(v) => setPayMethod(v as PaymentMethod)}
                      disabled={paymentNeedsReconciliation}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Referencia (Nº Transferencia/Comprobante)">
                  <Input
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="TR-940291"
                    disabled={paymentNeedsReconciliation}
                  />
                </Field>

                <Field label="Notas / Observaciones">
                  <Input
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Abono parcial correspondiente a la factura"
                    disabled={paymentNeedsReconciliation}
                  />
                </Field>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentCredit(null)} disabled={pending}>
              Cerrar
            </Button>
            {pendingPaymentError && (
              <p role="alert" className="text-sm text-destructive">
                {pendingPaymentError}
              </p>
            )}
            {paymentNeedsReconciliation && (
              <Button variant="outline" onClick={reconcilePayment} disabled={pending}>
                Consultar y reintentar la misma operación
              </Button>
            )}
            {paymentNeedsReconciliation && (
              <p role="alert" className="w-full text-sm text-destructive">
                La respuesta no quedó confirmada. Conservamos los mismos datos y clave; no inicies
                otro pago.
              </p>
            )}
            <Button
              onClick={registerPayment}
              disabled={pending || paymentNeedsReconciliation}
              className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
            >
              {pending
                ? "Guardando…"
                : paymentNeedsReconciliation
                  ? "Reconciliación requerida"
                  : "Confirmar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Purchase History Dialog */}
      <Dialog
        open={!!selectedSupplierForHistory}
        onOpenChange={(o) => !o && setSelectedSupplierForHistory(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#D4AF37]" />
              Historial de Compras — {selectedSupplierForHistory?.name}
            </DialogTitle>
          </DialogHeader>

          {purchasesTable.loadError && (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm"
            >
              <span>No se pudo cargar el historial: {purchasesTable.loadError}</span>
              <Button variant="outline" onClick={() => void purchasesTable.refresh()}>
                Reintentar
              </Button>
            </div>
          )}
          <div
            role="region"
            aria-label="Historial de compras del proveedor"
            tabIndex={0}
            className="rounded-lg border border-border overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Factura / ID</th>
                  <th className="text-left px-3 py-2.5">Producto / Descripción</th>
                  <th className="text-right px-3 py-2.5">Cant.</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-center px-3 py-2.5">Método</th>
                  <th className="text-left px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {purchasesTable.loading && purchases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      role="status"
                      className="py-8 text-center text-muted-foreground"
                    >
                      Cargando compras…
                    </td>
                  </tr>
                ) : supplierPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay compras registradas con este proveedor.
                    </td>
                  </tr>
                ) : (
                  supplierPurchases.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDate(p.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">
                        {p.invoiceNo || p.id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{p.description}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{p.quantity}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        {fmtMoney(p.total, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            p.paymentType === "credito"
                              ? "bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {p.paymentType === "credito" ? "Crédito" : "Contado"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.voidedAt ? (
                          <span className="text-muted-foreground">Anulada</span>
                        ) : (
                          "Registrada"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSupplierForHistory(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!partyToRemove}
        onOpenChange={(open) => {
          if (!open && !pending) setPartyToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {partyHasHistory
                ? "Conservar historial del proveedor"
                : !historyCheckReady
                  ? "No se pudo verificar el historial"
                  : "Eliminar o desactivar proveedor"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {partyHasHistory
                ? `${partyToRemove?.name} tiene compras o créditos relacionados. Solo se permite desactivarlo; sus documentos y pagos se conservan.`
                : !historyCheckReady
                  ? "No hay una lectura completa y autorizada de compras y créditos. Por seguridad no se habilita el borrado; puedes desactivar el proveedor y reintentar la verificación después."
                  : `No encontramos compras ni créditos relacionados con ${partyToRemove?.name}. El borrado depende de esta verificación y de las restricciones referenciales del servidor.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void confirmRemoveSupplier(true)}
            >
              Desactivar
            </Button>
            {historyCheckReady && !partyHasHistory && (
              <AlertDialogAction
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  void confirmRemoveSupplier(false);
                }}
              >
                Eliminar definitivamente
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  children,
  className,
  error,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  error?: string;
  htmlFor?: string;
}) {
  const fieldId =
    htmlFor ?? `party-field-${label.toLocaleLowerCase("es-DO").replace(/[^a-z0-9]+/g, "-")}`;
  const child = isValidElement(children) ? (children as React.ReactElement<{ id?: string }>) : null;
  const control =
    child && (child.type === Input || child.type === Textarea)
      ? cloneElement(child, { id: child.props.id ?? fieldId })
      : children;
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label htmlFor={fieldId} className="text-xs font-medium text-neutral-300">
        {label}
      </Label>
      {control}
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CreditStatus }) {
  switch (status) {
    case "pagada":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          Pagada
        </span>
      );
    case "parcial":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
          Parcial
        </span>
      );
    case "vencida":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
          Vencida
        </span>
      );
    case "anulada":
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
          Anulada
        </span>
      );
    case "pendiente":
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30">
          Pendiente
        </span>
      );
  }
}

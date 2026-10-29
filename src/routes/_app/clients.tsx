import { createFileRoute } from "@tanstack/react-router";
import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";
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
  UserCheck,
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
  parseMoneyToCents,
  persistPendingCreditPayment,
  readPendingCreditPayment,
  summarizeCredits,
  validatePartyForm,
  type CreditPaymentOperation,
} from "@/lib/creditWorkflows.js";

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
  const { user, can } = useAuth();
  const canViewSales = can("sales") || can("clients");
  const clientsTable = useSupabaseTable<Client>("clients");
  const { data: clients, insert, update, remove } = clientsTable;
  const creditsTable = useSupabaseTable<ClientCredit>(
    "client_credits",
    "created_at",
    false,
    "*",
    canViewSales,
  );
  const { data: credits, refresh: refreshCredits } = creditsTable;
  const paymentsTable = useSupabaseTable<CreditPayment>(
    "credit_payments",
    "created_at",
    false,
    "*",
    can("clients"),
  );
  const { data: payments, refresh: refreshPayments } = paymentsTable;
  const salesTable = useSupabaseTable<Sale>("sales", "created_at", false, "*", canViewSales);
  const { data: sales } = salesTable;
  const [settings] = useSettings();
  const paymentInFlight = useRef(false);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [formErrors, setFormErrors] = useState<Partial<Record<"name" | "email", string>>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "rejected">("idle");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activo" | "inactivo">("todos");
  const [partyToRemove, setPartyToRemove] = useState<Client | null>(null);

  // Credit & Sales History Modals
  const [selectedClientForCredits, setSelectedClientForCredits] = useState<Client | null>(null);
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<Client | null>(null);
  const [creditFilter, setCreditFilter] = useState<"todas" | CreditStatus>("todas");

  // Payment registration
  const [paymentCredit, setPaymentCredit] = useState<ClientCredit | null>(null);
  const [payAmount, setPayAmount] = useState<string>("0");
  const [payDate, setPayDate] = useState<string>(localDateInDominicanRepublic());
  const [payMethod, setPayMethod] = useState<PaymentMethod>("efectivo");
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
      pendingPayment.operation !== "client_payment" ||
      pendingPayment.actorId !== user?.authUserId
    )
      return;
    const credit = credits.find((item) => item.id === pendingPayment.creditId);
    if (!credit) return;
    setPaymentCredit(credit);
    setPayAmount(pendingPayment.request.amount);
    setPayDate(String(pendingPayment.request.date ?? localDateInDominicanRepublic()));
    setPayMethod(String(pendingPayment.request.method ?? "efectivo") as PaymentMethod);
    setPayRef(String(pendingPayment.request.reference ?? ""));
    setPayNote(String(pendingPayment.request.note ?? ""));
    setPaymentNeedsReconciliation(true);
  }, [pendingPayment, user?.authUserId, credits]);

  const startNew = () => {
    setEditing(null);
    setForm(emptyClient);
    setFormErrors({});
    setSaveState("idle");
    setOpenForm(true);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setForm({ ...emptyClient, ...c });
    setFormErrors({});
    setSaveState("idle");
    setOpenForm(true);
  };

  const saveClient = async () => {
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
        toast.success("Cliente actualizado");
      } else {
        await insert({ id: uid(), createdAt: new Date().toISOString(), ...form });
        toast.success("Cliente agregado");
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

  const historyCheckReady =
    canViewSales &&
    !salesTable.loading &&
    !salesTable.stale &&
    !salesTable.loadError &&
    !creditsTable.loading &&
    !creditsTable.stale &&
    !creditsTable.loadError;
  const clientHasHistory = Boolean(
    partyToRemove &&
    (sales.some((sale) => sale.clientId === partyToRemove.id) ||
      credits.some((credit) => credit.clientId === partyToRemove.id)),
  );
  const removeClient = (client: Client) => setPartyToRemove(client);

  const confirmRemoveClient = async (deactivate: boolean) => {
    const client = partyToRemove;
    if (
      !client ||
      pending ||
      partyActionInFlight.current ||
      (!deactivate && (!historyCheckReady || clientHasHistory))
    )
      return;
    partyActionInFlight.current = true;
    setPending(true);
    try {
      if (deactivate) {
        await update(client.id, { status: "inactivo" });
        toast.success("Cliente desactivado; su historial se conserva.");
      } else {
        await remove(client.id);
        toast.success("Cliente eliminado");
      }
      setPartyToRemove(null);
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      partyActionInFlight.current = false;
      setPending(false);
    }
  };
  const openPaymentModal = (credit: ClientCredit) => {
    if (!paymentRecoveryLoaded || pendingPayment || pendingPaymentError) return;
    setPaymentNeedsReconciliation(false);
    setPaymentCredit(credit);
    setPayAmount(formatMoneyFromCents(parseMoneyToCents(credit.balance) ?? 0));
    setPayDate(localDateInDominicanRepublic());
    setPayMethod("efectivo");
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
        .from("client_credits")
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
        operation: "client_payment",
        creditType: "client",
        creditId: paymentCredit.id,
        idempotencyKey,
        request: {
          idempotency_key: idempotencyKey,
          credit_type: "client",
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
      await postBusinessOperation("client_payment", operation.request);
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
        "client_payment",
        operation.idempotencyKey,
      );
      if (result) {
        await finishPayment(operation);
        return;
      }
      const retried = await postBusinessOperation("client_payment", operation.request);
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
  const filteredClients = clients.filter((c) => {
    const searchable = [
      c.name,
      c.email,
      c.phone,
      c.phoneSecondary,
      c.rnc,
      c.city,
      c.province,
      c.address,
      c.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-DO");
    return (
      searchable.includes(q.trim().toLocaleLowerCase("es-DO")) &&
      (statusFilter === "todos" || (c.status || "activo") === statusFilter)
    );
  });

  // Client Credits
  const clientCredits = selectedClientForCredits
    ? credits.filter((cr) => cr.clientId === selectedClientForCredits.id)
    : [];

  const clientCreditSummary = summarizeCredits(clientCredits);
  const totalCreditSales = clientCreditSummary.original;
  const totalCreditPaid = clientCreditSummary.paid;
  const totalCreditBalance = clientCreditSummary.balance;

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
                <Plus className="h-4 w-4 mr-1.5" /> Nuevo cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Field label="Nombre o razón social" error={formErrors.name} htmlFor="client-name">
                  <Input
                    id="client-name"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(formErrors.name)}
                    aria-describedby={formErrors.name ? "client-name-error" : undefined}
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      setFormErrors({ ...formErrors, name: undefined });
                    }}
                    placeholder="Nombre de la persona o negocio"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="RNC / Cédula">
                    <Input
                      value={form.rnc || ""}
                      onChange={(e) => setForm({ ...form, rnc: e.target.value })}
                      placeholder="Identificación (opcional)"
                    />
                  </Field>
                  <Field label="Estado">
                    <Select
                      value={form.status || "activo"}
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
                  <Field label="Correo electrónico" error={formErrors.email} htmlFor="client-email">
                    <Input
                      id="client-email"
                      type="email"
                      aria-invalid={Boolean(formErrors.email)}
                      aria-describedby={formErrors.email ? "client-email-error" : undefined}
                      value={form.email}
                      onChange={(e) => {
                        setForm({ ...form, email: e.target.value });
                        setFormErrors({ ...formErrors, email: undefined });
                      }}
                      placeholder="nombre@ejemplo.com"
                    />
                  </Field>
                  <Field label="Teléfono Principal">
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="809-555-0100"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Provincia">
                    <Input
                      value={form.province || ""}
                      onChange={(e) => setForm({ ...form, province: e.target.value })}
                      placeholder="Santo Domingo"
                    />
                  </Field>
                  <Field label="Ciudad / Municipio">
                    <Input
                      value={form.city || ""}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="Santo Domingo Este"
                    />
                  </Field>
                </div>

                <Field label="Dirección">
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Calle Principal #45"
                  />
                </Field>

                <Field label="Notas / Preferencias">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Cliente frecuente de ceras y bálsamos de barba, prefiere pedidos al por mayor"
                  />
                </Field>
              </div>
              {saveState === "saving" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Guardando cliente…
                </p>
              )}
              {saveState === "rejected" && (
                <p role="alert" className="text-sm text-destructive">
                  No se guardó el cliente. Revisa los campos y vuelve a intentarlo; la información
                  escrita sigue disponible.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenForm(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button
                  onClick={saveClient}
                  disabled={pending}
                  className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                >
                  {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar cliente"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Buscar clientes"
          placeholder="Buscar por nombre, contacto, ciudad o RNC"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Label htmlFor="client-status-filter" className="text-sm">
          Estado
        </Label>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
        >
          <SelectTrigger id="client-status-filter" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="inactivo">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
            pendingPayment.operation === "client_payment"
              ? "Hay un pago de cliente pendiente de conciliación. No inicies otro pago hasta resolverlo."
              : "Hay una operación financiera pendiente en otra sesión o módulo. Inicia sesión con su usuario y continúa en su módulo para conciliarla."}
          </span>
          {pendingPayment.actorId === user?.authUserId &&
            pendingPayment.operation === "client_payment" && (
              <Button variant="outline" onClick={reconcilePayment} disabled={pending}>
                Consultar y reintentar la misma operación
              </Button>
            )}
        </div>
      )}

      {clientsTable.loadError && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm"
        >
          <span>No se pudo cargar la lista: {clientsTable.loadError}</span>
          <Button variant="outline" onClick={() => void clientsTable.refresh()}>
            Reintentar
          </Button>
        </div>
      )}
      <div
        role="region"
        aria-label="Lista de clientes; desplázate horizontalmente para ver todas las columnas"
        tabIndex={0}
        className="rounded-xl border border-border bg-card overflow-x-auto shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            <tr>
              <th className="text-left px-4 py-3.5">Nombre / Razón Social</th>
              <th className="text-left px-4 py-3.5">Contacto</th>
              <th className="text-left px-4 py-3.5">Ubicación</th>
              <th className="text-left px-4 py-3.5">Registrado</th>
              <th className="text-left px-4 py-3.5">Estado</th>
              <th className="px-4 py-3.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {clientsTable.loading && clients.length === 0 ? (
              <tr>
                <td colSpan={6} role="status" className="text-center py-12 text-muted-foreground">
                  Cargando clientes…
                </td>
              </tr>
            ) : clientsTable.loadError && clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  No se muestran resultados hasta recuperar la lista.
                </td>
              </tr>
            ) : filteredClients.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  {q || statusFilter !== "todos"
                    ? "No hay clientes que coincidan con la búsqueda y el estado."
                    : "Aún no hay clientes registrados."}
                </td>
              </tr>
            ) : (
              filteredClients.map((c) => {
                const pendingCount = credits.filter(
                  (cr) => cr.clientId === c.id && cr.status !== "anulada" && cr.balance > 0,
                ).length;

                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-[#D4AF37]" />
                        {c.name}
                      </div>
                      {c.rnc && (
                        <div className="text-[11px] font-mono text-muted-foreground">
                          RNC: {c.rnc}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <div>{c.phone || "Sin teléfono"}</div>
                      <div className="text-[11px]">{c.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {[c.city, c.province].filter(Boolean).join(", ") || c.address || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {fmtDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${c.status === "inactivo" ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-600"}`}
                      >
                        {c.status === "inactivo" ? "Inactivo" : "Activo"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-wrap justify-end gap-1 items-center">
                        {canViewSales && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedClientForCredits(c)}
                              aria-label={`Ver créditos de ${c.name}`}
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
                              aria-label={`Ver ventas de ${c.name}`}
                              title="Historial de Ventas"
                              className="h-8 px-2 text-xs hover:border-[#D4AF37] hover:text-[#D4AF37]"
                            >
                              <History className="h-3.5 w-3.5 mr-1" />
                              Ventas
                            </Button>
                          </>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(c)}
                          aria-label={`Editar cliente ${c.name}`}
                          className="h-8 px-2 hover:text-[#D4AF37]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeClient(c)}
                          aria-label={`Desactivar o eliminar cliente ${c.name}`}
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

      {/* Client Credits Modal */}
      <Dialog
        open={!!selectedClientForCredits}
        onOpenChange={(o) => !o && setSelectedClientForCredits(null)}
      >
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
              <div className="text-xs uppercase text-muted-foreground font-medium">
                Total Créditos Ventas
              </div>
              <div className="text-lg font-mono font-bold text-foreground mt-1">
                {fmtMoney(totalCreditSales, settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground font-medium">
                Total Cobrado/Pagado
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

          {/* Status Filters */}
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

          <div
            role="region"
            aria-label="Créditos del cliente"
            tabIndex={0}
            className="rounded-lg border border-border overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[760px] text-sm">
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
                ) : filteredClientCredits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay facturas a crédito registradas para este cliente.
                    </td>
                  </tr>
                ) : (
                  filteredClientCredits.map((cr) => (
                    <tr key={cr.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">
                        {cr.receiptNo}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDate(cr.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {fmtMoney(cr.total, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-500">
                        {fmtMoney(cr.paid, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#D4AF37]">
                        {fmtMoney(cr.balance, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={cr.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {cr.status !== "anulada" && cr.balance > 0 ? (
                          <Button
                            size="sm"
                            onClick={() => openPaymentModal(cr)}
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
                            {cr.status === "anulada" ? "Anulada" : "Pagada"}
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
            <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
              No se pudo cargar el historial de pagos.{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => void refreshPayments()}>
                Reintentar
              </Button>
            </div>
          ) : (
            <section aria-labelledby="client-payment-history-title" className="mt-4">
              <h3 id="client-payment-history-title" className="mb-2 text-sm font-semibold">
                Movimientos de pago
              </h3>
              <div
                role="region"
                aria-label="Movimientos de pago del cliente"
                tabIndex={0}
                className="rounded-lg border border-border overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Recibo</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Método / referencia</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                      <th className="px-3 py-2 text-left">Estado del documento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {(() => {
                      const creditById = new Map(
                        clientCredits.map((credit) => [credit.id, credit]),
                      );
                      const movements = payments.filter(
                        (payment) =>
                          "clientCreditId" in payment &&
                          payment.clientCreditId !== undefined &&
                          creditById.has(payment.clientCreditId),
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
                          "clientCreditId" in payment && payment.clientCreditId
                            ? creditById.get(payment.clientCreditId)
                            : undefined;
                        return (
                          <tr key={payment.id}>
                            <td className="px-3 py-2 font-mono">{credit?.receiptNo}</td>
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
            <Button variant="outline" onClick={() => setSelectedClientForCredits(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Modal for Client Credit */}
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
                  <span className="font-mono">
                    {fmtMoney(paymentCredit.total, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-500">
                  <span>Monto pagado previamente:</span>
                  <span className="font-mono">
                    {fmtMoney(paymentCredit.paid, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-[#D4AF37] pt-1 border-t border-border">
                  <span>Saldo pendiente actual:</span>
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
                  <Field label="Fecha del cobro">
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
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Referencia (opcional)">
                  <Input
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Voucher #8291 / Depósito"
                    disabled={paymentNeedsReconciliation}
                  />
                </Field>

                <Field label="Notas / Observaciones">
                  <Input
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Abono a la deuda recibo"
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
                  : "Confirmar Cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Sales History Dialog */}
      <Dialog
        open={!!selectedClientForHistory}
        onOpenChange={(o) => !o && setSelectedClientForHistory(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#D4AF37]" />
              Historial de Ventas — {selectedClientForHistory?.name}
            </DialogTitle>
          </DialogHeader>

          {salesTable.loadError && (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm"
            >
              <span>No se pudo cargar el historial: {salesTable.loadError}</span>
              <Button variant="outline" onClick={() => void salesTable.refresh()}>
                Reintentar
              </Button>
            </div>
          )}
          <div
            role="region"
            aria-label="Historial de ventas del cliente"
            tabIndex={0}
            className="rounded-lg border border-border overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Recibo Nº</th>
                  <th className="text-left px-3 py-2.5">Productos comprados</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-center px-3 py-2.5">Método</th>
                  <th className="text-left px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {salesTable.loading && sales.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      role="status"
                      className="text-center py-8 text-muted-foreground"
                    >
                      Cargando historial de ventas…
                    </td>
                  </tr>
                ) : clientSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No hay historial de ventas registrado para este cliente.
                    </td>
                  </tr>
                ) : (
                  clientSales.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDate(s.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{s.receiptNo}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {s.lines.map((l) => `${l.quantity}x ${l.name}`).join(", ")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        {fmtMoney(s.total, settings.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            s.paymentType === "credito"
                              ? "bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.paymentType === "credito" ? "Crédito" : "Contado"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {s.voidedAt ? (
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
            <Button variant="outline" onClick={() => setSelectedClientForHistory(null)}>
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
              {clientHasHistory
                ? "Conservar historial del cliente"
                : !historyCheckReady
                  ? "No se pudo verificar el historial"
                  : "Eliminar o desactivar cliente"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {clientHasHistory
                ? `${partyToRemove?.name} tiene ventas o créditos relacionados. Solo se permite desactivarlo; sus documentos y pagos se conservan.`
                : !historyCheckReady
                  ? "No hay una lectura completa y autorizada de ventas y créditos. Por seguridad no se habilita el borrado; puedes desactivar el cliente y reintentar la verificación después."
                  : `No encontramos ventas ni créditos relacionados con ${partyToRemove?.name}. El borrado depende de esta verificación y de las restricciones referenciales del servidor.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void confirmRemoveClient(true)}
            >
              Desactivar
            </Button>
            {historyCheckReady && !clientHasHistory && (
              <AlertDialogAction
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  void confirmRemoveClient(false);
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

import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useSupabaseTable, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import type { Expense, ExpenseCategory, PaymentMethod } from "@/lib/types";
import { PageHeader, StatCard } from "@/components/PageHeader";
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
  Plus,
  Search,
  Wallet,
  Calendar,
  DollarSign,
  Eye,
  Ban,
  TrendingDown,
  PieChart,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { PersistenceError, userPersistenceMessage } from "@/lib/persistence.js";
import {
  clearPendingBusinessOperation,
  persistPendingBusinessOperation,
  readPendingBusinessOperation,
} from "@/lib/pendingBusinessOperation.js";
import {
  getConfirmedBusinessOperation,
  postBusinessOperation,
  runFinancialCorrection,
} from "@/lib/businessOperations";
import {
  filterExpenses,
  localExpenseDate,
  normalizeExpenseAmount,
  summarizeExpenses,
  validateExpenseDraft,
} from "@/lib/expenseWorkflows.js";
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

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
});

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  nomina: "Nómina",
  alquiler: "Alquiler",
  electricidad: "Electricidad",
  agua: "Agua",
  internet: "Internet",
  telefono: "Teléfono",
  transporte: "Transporte",
  combustible: "Combustible",
  mantenimiento: "Mantenimiento",
  papeleria: "Papelería",
  limpieza: "Limpieza",
  publicidad: "Publicidad",
  servicios_profesionales: "Servicios Profesionales",
  comisiones: "Comisiones",
  impuestos: "Impuestos",
  otros: "Otros Gastos Operativos",
};

const emptyExpense: Omit<Expense, "id" | "createdAt"> = {
  concept: "",
  category: "servicios_profesionales",
  description: "",
  amount: 0,
  date: localExpenseDate(),
  paymentMethod: "transferencia",
  beneficiary: "",
  reference: "",
  note: "",
  status: "registrado",
  registeredBy: "",
};

function ExpensesPage() {
  const { data: expenses, loading, loadError, refresh } = useSupabaseTable<Expense>("expenses");
  const [settings] = useSettings();
  const { user } = useAuth();

  const [openForm, setOpenForm] = useState(false);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyExpense);
  const [amountText, setAmountText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [pendingOperationType, setPendingOperationType] = useState<string | null>(null);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [annulling, setAnnulling] = useState<Expense | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [annulPending, setAnnulPending] = useState(false);
  const [annulError, setAnnulError] = useState("");
  const [annulUncertain, setAnnulUncertain] = useState(false);
  const expenseIntent = useRef<{
    actorId: string;
    request: Record<string, unknown> & { idempotency_key: string };
  } | null>(null);
  const expenseSaveLock = useRef(false);
  const correctionIntents = useRef(
    new Map<
      string,
      {
        actorId: string;
        request: Record<string, unknown> & { idempotency_key: string };
      }
    >(),
  );
  const annulSaveLock = useRef(false);

  useEffect(() => {
    const actorId = user?.authUserId;
    if (!actorId || typeof window === "undefined") return;
    try {
      const operation = readPendingBusinessOperation(window.sessionStorage, actorId);
      if (!operation) return;
      setPendingOperationType(operation.type);
      setNeedsReconciliation(true);
      if (operation.type === "expense") {
        const request = operation.request as Record<string, unknown> & {
          idempotency_key: string;
        };
        expenseIntent.current = { actorId, request };
        setForm({
          ...emptyExpense,
          concept: String(request.concept ?? ""),
          category: String(request.category ?? "otros") as ExpenseCategory,
          description: String(request.description ?? ""),
          amount: Number(request.amount ?? 0),
          date: String(request.date ?? localExpenseDate()),
          paymentMethod: String(request.payment_method ?? "efectivo") as PaymentMethod,
          beneficiary: String(request.beneficiary ?? ""),
          reference: String(request.reference ?? ""),
          note: String(request.note ?? ""),
          registeredBy: user?.name || user?.username || "Administrador",
        });
        setAmountText(String(request.amount ?? ""));
        setUncertain(true);
        setOpenForm(true);
        return;
      }
      if (
        operation.type === "financial_annulment" &&
        operation.request.document_type === "expense"
      ) {
        const context = operation.context as { document?: Expense; reason?: string } | undefined;
        const expenseId = String(operation.request.document_id);
        correctionIntents.current.set(expenseId, {
          actorId,
          request: operation.request as Record<string, unknown> & {
            idempotency_key: string;
          },
        });
        if (context?.document) setAnnulling(context.document);
        setAnnulReason(context?.reason ?? String(operation.request.reason ?? ""));
        setAnnulUncertain(true);
        return;
      }
    } catch (error) {
      setPendingOperationType("unreadable");
      setNeedsReconciliation(true);
      toast.error(
        error instanceof Error
          ? error.message
          : "Existe una operación financiera pendiente que requiere conciliación.",
      );
    }
  }, [user?.authUserId, user?.name, user?.username]);

  // Filters
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const startNew = () => {
    setForm({
      ...emptyExpense,
      date: localExpenseDate(),
      registeredBy: user?.name || user?.username || "Administrador",
    });
    setAmountText("");
    setFieldErrors({});
    setOpenForm(true);
  };

  const saveExpense = async () => {
    if (expenseSaveLock.current || pending) return;
    if (pendingOperationType && pendingOperationType !== "expense") {
      toast.error("Primero concilia la operación financiera pendiente de este usuario.");
      return;
    }
    if (uncertain && expenseIntent.current?.actorId !== user?.authUserId) {
      toast.error(
        "La operaci\u00f3n pendiente pertenece a otra sesi\u00f3n. Inicia sesi\u00f3n con el usuario original para conciliarla.",
      );
      return;
    }
    if (!uncertain) {
      const errors = validateExpenseDraft({ ...form, amount: amountText });
      setFieldErrors(errors);
      if (Object.keys(errors).length) {
        toast.error("Revisa los campos marcados antes de guardar.");
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus();
        });
        return;
      }
      expenseIntent.current = {
        actorId: user?.authUserId ?? "",
        request: {
          idempotency_key: globalThis.crypto.randomUUID(),
          concept: form.concept.trim(),
          category: form.category,
          description: form.description,
          amount: normalizeExpenseAmount(amountText),
          date: form.date,
          payment_method: form.paymentMethod,
          beneficiary: form.beneficiary,
          reference: form.reference ?? null,
          note: form.note ?? null,
        },
      };
      try {
        if (typeof window === "undefined" || !user?.authUserId)
          throw new Error("No se puede conservar la operación pendiente en esta sesión.");
        persistPendingBusinessOperation(window.sessionStorage, user.authUserId, {
          type: "expense",
          idempotencyKey: expenseIntent.current.request.idempotency_key,
          request: expenseIntent.current.request,
        });
        setPendingOperationType("expense");
      } catch (error) {
        expenseIntent.current = null;
        toast.error(userPersistenceMessage(error));
        return;
      }
    }

    const intent = expenseIntent.current;
    if (!intent) {
      toast.error(
        "No se pudo recuperar la intenci\u00f3n de gasto. Conservamos el formulario; valida antes de guardar.",
      );
      setUncertain(false);
      return;
    }
    expenseSaveLock.current = true;
    setPending(true);
    try {
      if (uncertain) {
        const confirmed = await getConfirmedBusinessOperation(
          "expense",
          intent.request.idempotency_key,
        );
        if (confirmed) {
          clearPendingBusinessOperation(
            window.sessionStorage,
            user!.authUserId!,
            intent.request.idempotency_key,
          );
          expenseIntent.current = null;
          setUncertain(false);
          setPendingOperationType(null);
          setNeedsReconciliation(false);
          void refresh();
          toast.success("Gasto confirmado y recuperado");
          setOpenForm(false);
          return;
        }
      }
      await postBusinessOperation("expense", intent.request);
      clearPendingBusinessOperation(
        window.sessionStorage,
        user!.authUserId!,
        intent.request.idempotency_key,
      );
      expenseIntent.current = null;
      setUncertain(false);
      setPendingOperationType(null);
      setNeedsReconciliation(false);
      void refresh();
      toast.success("Gasto registrado y persistido");
      setOpenForm(false);
    } catch (e) {
      const definitive =
        e instanceof PersistenceError &&
        ["denied", "validation", "not_found", "conflict"].includes(e.kind);
      if (definitive) {
        if (typeof window !== "undefined" && user?.authUserId)
          clearPendingBusinessOperation(
            window.sessionStorage,
            user.authUserId,
            intent.request.idempotency_key,
          );
        expenseIntent.current = null;
        setUncertain(false);
        setPendingOperationType(null);
        setNeedsReconciliation(false);
      } else {
        setUncertain(true);
        setPendingOperationType("expense");
        setNeedsReconciliation(true);
      }
      toast.error(userPersistenceMessage(e));
    } finally {
      expenseSaveLock.current = false;
      setPending(false);
    }
  };

  const requestAnnulment = (e: Expense) => {
    if (user?.role !== "admin") {
      toast.error("Solo un administrador activo puede anular gastos.");
      return;
    }
    if (e.status === "anulado") return;
    setAnnulReason("");
    setAnnulError("");
    setAnnulling(e);
  };

  const confirmAnnulment = async () => {
    const e = annulling;
    if (!e || annulPending || annulSaveLock.current || user?.role !== "admin") return;
    if (!annulReason.trim()) {
      setAnnulError("Escribe el motivo de la anulaci\u00f3n.");
      return;
    }
    const actorId = user.authUserId ?? "";
    let intent = correctionIntents.current.get(e.id);
    if (intent && intent.actorId !== actorId) {
      setAnnulError(
        "La anulaci\u00f3n pendiente pertenece a otra sesi\u00f3n. Debe conciliarla el administrador original.",
      );
      return;
    }
    if (!intent) {
      intent = {
        actorId,
        request: {
          idempotency_key: globalThis.crypto.randomUUID(),
          document_type: "expense",
          document_id: e.id,
          reason: annulReason.trim(),
        },
      };
      correctionIntents.current.set(e.id, intent);
    }
    try {
      if (!user.authUserId)
        throw new Error("No se puede conservar la anulacion pendiente en esta sesion.");
      persistPendingBusinessOperation(window.sessionStorage, user.authUserId, {
        type: "financial_annulment",
        idempotencyKey: intent.request.idempotency_key,
        request: intent.request,
        context: {
          documentType: "expense",
          documentId: e.id,
          reason: String(intent.request.reason),
          document: e,
        },
      });
      setPendingOperationType("financial_annulment");
    } catch (error) {
      correctionIntents.current.delete(e.id);
      setAnnulError(userPersistenceMessage(error));
      return;
    }
    annulSaveLock.current = true;
    setAnnulPending(true);
    try {
      if (annulUncertain) {
        const confirmed = await getConfirmedBusinessOperation(
          "financial_annulment",
          intent.request.idempotency_key,
        );
        if (confirmed) {
          clearPendingBusinessOperation(
            window.sessionStorage,
            user.authUserId,
            intent.request.idempotency_key,
          );
          correctionIntents.current.delete(e.id);
          void refresh();
          toast.success("Anulación confirmada y recuperada");
          setAnnulUncertain(false);
          setPendingOperationType(null);
          setNeedsReconciliation(false);
          setAnnulling(null);
          return;
        }
      }
      await runFinancialCorrection("financial_annulment", intent.request);
      clearPendingBusinessOperation(
        window.sessionStorage,
        user.authUserId,
        intent.request.idempotency_key,
      );
      correctionIntents.current.delete(e.id);
      void refresh();
      toast.success("Gasto anulado correctamente");
      setAnnulUncertain(false);
      setPendingOperationType(null);
      setNeedsReconciliation(false);
      setAnnulling(null);
    } catch (err) {
      const definitive =
        err instanceof PersistenceError &&
        ["denied", "validation", "not_found", "conflict"].includes(err.kind);
      if (definitive) {
        if (user.authUserId)
          clearPendingBusinessOperation(
            window.sessionStorage,
            user.authUserId,
            intent.request.idempotency_key,
          );
        correctionIntents.current.delete(e.id);
        setAnnulUncertain(false);
        setPendingOperationType(null);
        setNeedsReconciliation(false);
      } else {
        setAnnulUncertain(true);
        setPendingOperationType("financial_annulment");
        setNeedsReconciliation(true);
      }
      setAnnulError(userPersistenceMessage(err));
    } finally {
      annulSaveLock.current = false;
      setAnnulPending(false);
    }
  };

  // Date Filtering Logic
  const todayStr = localExpenseDate();
  const filteredExpenses = filterExpenses(expenses, {
    query: q,
    category: catFilter,
    method: methodFilter,
    status: statusFilter,
    from: dateFrom,
    to: dateTo,
  });
  const activeExpensesInFilter = filteredExpenses.filter((e) => e.status === "registrado");
  const summary = summarizeExpenses(expenses, todayStr);
  const periodTotal = activeExpensesInFilter.reduce((sum, e) => sum + e.amount, 0);
  const todayExpenses = summary.today;
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
  const monthExpenses = summary.month;
  const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Category breakdown calculation
  const categoryTotals: Partial<Record<ExpenseCategory, number>> = {};
  activeExpensesInFilter.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const sortedCategories = Object.entries(categoryTotals)
    .map(([cat, val]) => ({ category: cat as ExpenseCategory, total: val }))
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHeader
        title="Gastos Operativos"
        description="Registro, categorización, anulación y control de egresos financieros."
        actions={
          <Dialog
            open={openForm}
            onOpenChange={(next) => {
              if (!next && (pending || uncertain)) return;
              setOpenForm(next);
            }}
          >
            <DialogTrigger asChild>
              <Button
                disabled={pending || uncertain || !!pendingOperationType}
                onClick={startNew}
                className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Registrar gasto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Registrar nuevo gasto</DialogTitle>
              </DialogHeader>
              <div className="space-y-3" aria-busy={pending}>
                {uncertain && (
                  <p
                    role="status"
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100"
                  >
                    El resultado del gasto aún no se confirmó. Conservamos el borrador y
                    consultaremos la misma operación antes de reintentar.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Concepto" error={fieldErrors.concept}>
                    <Input
                      disabled={pending || uncertain}
                      value={form.concept}
                      onChange={(e) => setForm({ ...form, concept: e.target.value })}
                      placeholder="Ej. Pago de electricidad / Alquiler"
                    />
                  </Field>
                  <Field label="Categoría" error={fieldErrors.category}>
                    <Select
                      disabled={pending || uncertain}
                      value={form.category}
                      onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                          <SelectItem key={cat} value={cat}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monto" error={fieldErrors.amount}>
                    <Input
                      type="text"
                      inputMode="decimal"
                      disabled={pending || uncertain}
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                      placeholder="0.00"
                      className="font-mono font-bold text-base text-[#D4AF37]"
                    />
                  </Field>
                  <Field label="Fecha" error={fieldErrors.date}>
                    <Input
                      disabled={pending || uncertain}
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Método de pago" error={fieldErrors.paymentMethod}>
                    <Select
                      disabled={pending || uncertain}
                      value={form.paymentMethod}
                      onValueChange={(v) =>
                        setForm({ ...form, paymentMethod: v as PaymentMethod | "cheque" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Beneficiario (Empresa / Persona)" error={fieldErrors.beneficiary}>
                    <Input
                      disabled={pending || uncertain}
                      value={form.beneficiary}
                      onChange={(e) => setForm({ ...form, beneficiary: e.target.value })}
                      placeholder="EDENORTE / Propietario / Empleado"
                    />
                  </Field>
                </div>

                <Field label="Número de referencia / Comprobante (opcional)">
                  <Input
                    disabled={pending || uncertain}
                    value={form.reference || ""}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="TRX-940129 / Factura Nº"
                  />
                </Field>

                <Field label="Descripción del gasto">
                  <Input
                    disabled={pending || uncertain}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Factura de servicio eléctrico correspondiente al mes"
                  />
                </Field>

                <Field label="Observación / Notas adicionales">
                  <Textarea
                    disabled={pending || uncertain}
                    value={form.note || ""}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Aprobado por administración, pagado desde cuenta de banco principal"
                  />
                </Field>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpenForm(false)}
                  disabled={pending || uncertain}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={saveExpense}
                  disabled={pending}
                  className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                >
                  {pending
                    ? "Guardando…"
                    : uncertain
                      ? "Consultar y reintentar"
                      : "Registrar gasto"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Financial Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Gastos del período"
          value={fmtMoney(periodTotal, settings.currency)}
          hint={`${activeExpensesInFilter.length} gastos según filtros`}
          icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
        />
        <StatCard
          label="Gastos de hoy"
          value={fmtMoney(todayTotal, settings.currency)}
          hint={`${todayExpenses.length} egresos hoy`}
          icon={<Calendar className="h-5 w-5 text-[#D4AF37]" />}
        />
        <StatCard
          label="Gastos del mes"
          value={fmtMoney(monthTotal, settings.currency)}
          hint={`${monthExpenses.length} egresos este mes`}
          icon={<Wallet className="h-5 w-5 text-[#D4AF37]" />}
        />
        <StatCard
          label="Cantidad de gastos"
          value={String(filteredExpenses.length)}
          hint={`${filteredExpenses.filter((e) => e.status === "anulado").length} anulados`}
          icon={<DollarSign className="h-5 w-5 text-[#D4AF37]" />}
        />
      </div>

      {loading && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Cargando gastos…
        </p>
      )}
      {loadError && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <span>
            No se pudieron confirmar los gastos. {loadError}
            {expenses.length > 0 && " Los datos visibles pueden estar desactualizados."}
          </span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      )}
      {needsReconciliation &&
        pendingOperationType !== "expense" &&
        !(pendingOperationType === "financial_annulment" && annulling) && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            Existe otra operación financiera pendiente de conciliación para esta sesión. Resuélvela
            en su módulo antes de iniciar un gasto nuevo.
          </p>
        )}
      {user?.role !== "admin" && !user?.permissions?.includes("expenses") && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Tu cuenta no tiene permiso para registrar gastos.
        </p>
      )}
      {user?.role !== "admin" && user?.permissions?.includes("expenses") && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Puedes registrar y consultar gastos. La anulación está reservada a administradores.
        </p>
      )}

      {/* Category Spend Breakdown */}
      {sortedCategories.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
            <PieChart className="h-4 w-4 text-[#D4AF37]" />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Distribución de Gastos por Categoría (Período)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {sortedCategories.map(({ category, total }) => {
              const pct = periodTotal > 0 ? ((total / periodTotal) * 100).toFixed(1) : "0";
              return (
                <div
                  key={category}
                  className="p-3 rounded-lg bg-muted/30 border border-border/80 space-y-1.5"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-foreground truncate">
                      {CATEGORY_LABELS[category] || category}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-yellow-800 dark:text-[#D4AF37]">
                      {pct}%
                    </span>
                  </div>
                  <div className="font-mono font-bold text-sm text-foreground">
                    {fmtMoney(total, settings.currency)}
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#D4AF37] h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, +pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filters Toolbar */}
      <div className="p-4 rounded-xl border border-border bg-card mb-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar concepto, beneficiario, referencia…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las categorías</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                <SelectItem key={cat} value={cat}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Todos los métodos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los métodos</SelectItem>
              <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
              <SelectItem value="efectivo">Efectivo</SelectItem>
              <SelectItem value="tarjeta">Tarjeta</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="registrado">Registrados (Activos)</SelectItem>
              <SelectItem value="anulado">Anulados</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2 items-center">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs h-9"
              title="Fecha desde"
            />
            <span className="text-muted-foreground text-xs">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs h-9"
              title="Fecha hasta"
            />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div
        className="rounded-xl border border-border bg-card overflow-x-auto shadow-sm"
        tabIndex={0}
        aria-label="Tabla de gastos; desplázate horizontalmente para ver todas las columnas"
      >
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            <tr>
              <th className="text-left px-4 py-3.5">Fecha</th>
              <th className="text-left px-4 py-3.5">Concepto</th>
              <th className="text-left px-4 py-3.5">Categoría</th>
              <th className="text-left px-4 py-3.5">Beneficiario</th>
              <th className="text-left px-4 py-3.5">Método</th>
              <th className="text-right px-4 py-3.5">Monto</th>
              <th className="text-center px-4 py-3.5">Estado</th>
              <th className="px-4 py-3.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  Cargando registros…
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  No se puede confirmar si hay gastos hasta que la consulta tenga éxito.
                </td>
              </tr>
            ) : filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  {expenses.length
                    ? "No hay gastos que coincidan con los filtros."
                    : "Aún no hay gastos registrados."}
                </td>
              </tr>
            ) : (
              filteredExpenses.map((e) => (
                <tr
                  key={e.id}
                  className={`hover:bg-muted/30 transition-colors ${e.status === "anulado" ? "opacity-60 bg-muted/10" : ""}`}
                >
                  <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">
                    {fmtDate(e.date)}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-foreground">
                    <div
                      className={e.status === "anulado" ? "line-through text-muted-foreground" : ""}
                    >
                      {e.concept}
                    </div>
                    {e.reference && (
                      <div className="text-[11px] font-mono text-muted-foreground">
                        Ref: {e.reference}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    <span className="px-2 py-0.5 rounded bg-muted text-foreground border border-border text-[11px]">
                      {CATEGORY_LABELS[e.category] || e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-foreground font-medium">
                    {e.beneficiary}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground capitalize">
                    {e.paymentMethod}
                  </td>
                  <td
                    className={`px-4 py-3.5 text-right font-mono font-bold ${e.status === "anulado" ? "line-through text-muted-foreground" : "text-rose-700 dark:text-rose-400"}`}
                  >
                    {fmtMoney(e.amount, settings.currency)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {e.status === "anulado" ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                        Anulado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        Registrado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1 items-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setViewing(e)}
                        aria-label={`Ver detalle del gasto ${e.concept}`}
                        title="Ver detalle"
                        className="h-8 w-8 hover:text-[#D4AF37]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {e.status === "registrado" && (
                        <>
                          {user?.role === "admin" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => requestAnnulment(e)}
                              aria-label={`Anular gasto ${e.concept}`}
                              title="Anular gasto"
                              className="h-8 w-8 hover:text-rose-600 dark:hover:text-rose-400"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={!!annulling}
        onOpenChange={(open) => {
          if (!open && !annulPending && !annulUncertain) setAnnulling(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular gasto registrado</AlertDialogTitle>
            <AlertDialogDescription>
              Se conservará el gasto y su auditoría. Su importe dejará de contar como egreso activo.
              {annulling && (
                <span className="mt-2 block font-medium text-foreground">
                  {annulling.concept} · {fmtMoney(annulling.amount, settings.currency)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {annulUncertain && (
            <p
              role="status"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100"
            >
              El resultado de la anulación sigue pendiente. Conservamos el motivo y consultaremos la
              misma operación antes de reintentar.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="expense-annul-reason">Motivo obligatorio</Label>
            <Textarea
              id="expense-annul-reason"
              autoFocus
              value={annulReason}
              disabled={annulPending || annulUncertain}
              onChange={(event) => {
                setAnnulReason(event.target.value);
                setAnnulError("");
              }}
              aria-invalid={!!annulError}
              aria-describedby={annulError ? "expense-annul-error" : undefined}
              placeholder="Describe por qué debe anularse este gasto"
            />
            {annulError && (
              <p id="expense-annul-error" role="alert" className="text-sm text-destructive">
                {annulError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={annulPending || annulUncertain}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={annulPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmAnnulment();
              }}
            >
              {annulPending
                ? "Anulando…"
                : annulUncertain
                  ? "Consultar y reintentar"
                  : "Confirmar anulación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Expense Details Dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#D4AF37]" />
              Detalle del Gasto
            </DialogTitle>
          </DialogHeader>

          {viewing && (
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground uppercase tracking-wider font-medium">
                    Concepto:
                  </span>
                  <span className="font-bold text-sm text-foreground">{viewing.concept}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto:</span>
                  <span
                    className={`font-mono font-bold text-base ${viewing.status === "anulado" ? "line-through text-muted-foreground" : "text-yellow-800 dark:text-[#D4AF37]"}`}
                  >
                    {fmtMoney(viewing.amount, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoría:</span>
                  <span className="font-medium text-foreground">
                    {CATEGORY_LABELS[viewing.category]}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <span
                    className={`font-semibold uppercase ${viewing.status === "anulado" ? "text-rose-400" : "text-emerald-400"}`}
                  >
                    {viewing.status}
                  </span>
                </div>
              </div>

              <div className="space-y-2 px-1">
                <div className="flex justify-between border-b border-border/60 py-1.5">
                  <span className="text-muted-foreground">Beneficiario:</span>
                  <span className="font-medium">{viewing.beneficiary}</span>
                </div>
                <div className="flex justify-between border-b border-border/60 py-1.5">
                  <span className="text-muted-foreground">Método de pago:</span>
                  <span className="font-medium capitalize">{viewing.paymentMethod}</span>
                </div>
                <div className="flex justify-between border-b border-border/60 py-1.5">
                  <span className="text-muted-foreground">Fecha del gasto:</span>
                  <span className="font-mono">{fmtDate(viewing.date)}</span>
                </div>
                {viewing.reference && (
                  <div className="flex justify-between border-b border-border/60 py-1.5">
                    <span className="text-muted-foreground">Referencia / Comprobante:</span>
                    <span className="font-mono">{viewing.reference}</span>
                  </div>
                )}
                {viewing.description && (
                  <div className="border-b border-border/60 py-1.5">
                    <span className="text-muted-foreground block mb-0.5">Descripción:</span>
                    <span className="text-foreground">{viewing.description}</span>
                  </div>
                )}
                {viewing.note && (
                  <div className="border-b border-border/60 py-1.5">
                    <span className="text-muted-foreground block mb-0.5">Observación / Notas:</span>
                    <span className="text-foreground">{viewing.note}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> Registrado por:
                  </span>
                  <span className="font-medium text-foreground">
                    {viewing.registeredBy || "Administrador"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
  className,
  error,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const control = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (child.type === Select) {
      const nested = React.Children.map(
        (child.props as { children?: React.ReactNode }).children,
        (part) =>
          React.isValidElement(part) && part.type === SelectTrigger
            ? React.cloneElement(part as React.ReactElement<Record<string, unknown>>, {
                id,
                "aria-invalid": !!error,
                "aria-describedby": error ? errorId : undefined,
              })
            : part,
      );
      return React.cloneElement(child, undefined, nested);
    }
    return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      id,
      "aria-invalid": !!error,
      "aria-describedby": error ? errorId : undefined,
    });
  });
  return (
    <div className={`min-w-0 space-y-1.5 ${className || ""}`}>
      <Label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </Label>
      {control}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

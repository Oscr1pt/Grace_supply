import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSupabaseTable, uid, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import type {
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  PaymentMethod,
} from "@/lib/types";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Search, Filter, Wallet, Calendar, DollarSign, Eye, Ban, CheckCircle2, TrendingDown, PieChart, User } from "lucide-react";
import { toast } from "sonner";

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
  date: new Date().toISOString().slice(0, 10),
  paymentMethod: "transferencia",
  beneficiary: "",
  reference: "",
  note: "",
  status: "registrado",
  registeredBy: "",
};

function ExpensesPage() {
  const { data: expenses, insert, update } = useSupabaseTable<Expense>("expenses");
  const [settings] = useSettings();
  const { user } = useAuth();

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyExpense);

  // Filters
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const startNew = () => {
    setEditing(null);
    setForm({
      ...emptyExpense,
      date: new Date().toISOString().slice(0, 10),
      registeredBy: user?.name || user?.username || "Administrador",
    });
    setOpenForm(true);
  };

  const startEdit = (e: Expense) => {
    if (e.status === "anulado") {
      toast.error("No se puede editar un gasto anulado.");
      return;
    }
    setEditing(e);
    setForm({ ...emptyExpense, ...e });
    setOpenForm(true);
  };

  const saveExpense = async () => {
    if (!form.concept.trim()) {
      toast.error("El concepto del gasto es obligatorio");
      return;
    }
    if (form.amount <= 0) {
      toast.error("El monto debe ser mayor que 0");
      return;
    }
    if (!form.beneficiary.trim()) {
      toast.error("El beneficiario (persona o empresa) es obligatorio");
      return;
    }

    try {
      const now = new Date().toISOString();
      const currentUser = user?.name || user?.username || "Administrador";

      if (editing) {
        await update(editing.id, {
          ...form,
          updatedAt: now,
        });
        toast.success("Gasto actualizado");
      } else {
        await insert({
          id: uid(),
          ...form,
          registeredBy: currentUser,
          createdAt: now,
        });
        toast.success("Gasto registrado");
      }
      setOpenForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el gasto");
    }
  };

  const annulExpense = async (e: Expense) => {
    if (e.status === "anulado") return;
    if (!confirm(`¿Anular el gasto "${e.concept}" por ${fmtMoney(e.amount, settings.currency)}? El registro se conservará como anulado para auditoría.`)) {
      return;
    }
    try {
      await update(e.id, {
        status: "anulado",
        updatedAt: new Date().toISOString(),
      });
      toast.success("Gasto anulado correctamente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al anular gasto");
    }
  };

  // Date Filtering Logic
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM

  const filteredExpenses = expenses.filter((e) => {
    const matchesQ = [e.concept, e.beneficiary, e.reference, e.description, e.note]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase());

    const matchesCat = catFilter === "todos" || e.category === catFilter;
    const matchesMethod = methodFilter === "todos" || e.paymentMethod === methodFilter;
    const matchesStatus = statusFilter === "todos" || e.status === statusFilter;

    const matchesFrom = !dateFrom || e.date >= dateFrom;
    const matchesTo = !dateTo || e.date <= dateTo;

    return matchesQ && matchesCat && matchesMethod && matchesStatus && matchesFrom && matchesTo;
  });

  // Calculate Metrics (Active Expenses only)
  const activeExpensesInFilter = filteredExpenses.filter((e) => e.status === "registrado");
  const periodTotal = activeExpensesInFilter.reduce((sum, e) => sum + e.amount, 0);

  const todayExpenses = expenses.filter((e) => e.status === "registrado" && e.date === todayStr);
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  const monthExpenses = expenses.filter((e) => e.status === "registrado" && e.date.startsWith(currentMonthStr));
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
          <Dialog open={openForm} onOpenChange={setOpenForm}>
            <DialogTrigger asChild>
              <Button onClick={startNew} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                <Plus className="h-4 w-4 mr-1.5" /> Registrar gasto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar gasto" : "Registrar nuevo gasto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Concepto">
                    <Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Ej. Pago de electricidad / Alquiler" />
                  </Field>
                  <Field label="Categoría">
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                          <SelectItem key={cat} value={cat}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monto">
                    <Input
                      type="number"
                      step="0.01"
                      min={0.01}
                      value={form.amount || ""}
                      onChange={(e) => setForm({ ...form, amount: Math.max(0, +e.target.value) })}
                      placeholder="0.00"
                      className="font-mono font-bold text-base text-[#D4AF37]"
                    />
                  </Field>
                  <Field label="Fecha">
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Método de pago">
                    <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Beneficiario (Empresa / Persona)">
                    <Input value={form.beneficiary} onChange={(e) => setForm({ ...form, beneficiary: e.target.value })} placeholder="EDENORTE / Propietario / Empleado" />
                  </Field>
                </div>

                <Field label="Número de referencia / Comprobante (opcional)">
                  <Input value={form.reference || ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="TRX-940129 / Factura Nº" />
                </Field>

                <Field label="Descripción del gasto">
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Factura de servicio eléctrico correspondiente al mes" />
                </Field>

                <Field label="Observación / Notas adicionales">
                  <Textarea value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Aprobado por administración, pagado desde cuenta de banco principal" />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
                <Button onClick={saveExpense} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                  {editing ? "Guardar cambios" : "Registrar gasto"}
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
                <div key={category} className="p-3 rounded-lg bg-muted/30 border border-border/80 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-foreground truncate">{CATEGORY_LABELS[category] || category}</span>
                    <span className="font-mono text-[11px] text-[#D4AF37] font-semibold">{pct}%</span>
                  </div>
                  <div className="font-mono font-bold text-sm text-foreground">{fmtMoney(total, settings.currency)}</div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#D4AF37] h-full rounded-full transition-all" style={{ width: `${Math.min(100, +pct)}%` }} />
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
            <SelectTrigger className="text-xs"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las categorías</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                <SelectItem key={cat} value={cat}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="text-xs"><SelectValue placeholder="Todos los métodos" /></SelectTrigger>
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
            <SelectTrigger className="text-xs"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="registrado">Registrados (Activos)</SelectItem>
              <SelectItem value="anulado">Anulados</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2 items-center">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-xs h-9" title="Fecha desde" />
            <span className="text-muted-foreground text-xs">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-xs h-9" title="Fecha hasta" />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
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
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  No hay gastos registrados que coincidan con los filtros de búsqueda.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((e) => (
                <tr key={e.id} className={`hover:bg-muted/30 transition-colors ${e.status === "anulado" ? "opacity-60 bg-muted/10" : ""}`}>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3.5 font-medium text-foreground">
                    <div className={e.status === "anulado" ? "line-through text-muted-foreground" : ""}>{e.concept}</div>
                    {e.reference && <div className="text-[11px] font-mono text-muted-foreground">Ref: {e.reference}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    <span className="px-2 py-0.5 rounded bg-muted text-foreground border border-border text-[11px]">
                      {CATEGORY_LABELS[e.category] || e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-foreground font-medium">{e.beneficiary}</td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground capitalize">{e.paymentMethod}</td>
                  <td className={`px-4 py-3.5 text-right font-mono font-bold ${e.status === "anulado" ? "line-through text-muted-foreground" : "text-rose-400"}`}>
                    {fmtMoney(e.amount, settings.currency)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {e.status === "anulado" ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Anulado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Registrado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1 items-center">
                      <Button size="icon" variant="ghost" onClick={() => setViewing(e)} title="Ver detalle" className="h-8 w-8 hover:text-[#D4AF37]">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {e.status === "registrado" && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => startEdit(e)} title="Editar" className="h-8 w-8 hover:text-[#D4AF37]">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => annulExpense(e)} title="Anular gasto" className="h-8 w-8 hover:text-rose-400">
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
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
                  <span className="text-muted-foreground uppercase tracking-wider font-medium">Concepto:</span>
                  <span className="font-bold text-sm text-foreground">{viewing.concept}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto:</span>
                  <span className={`font-mono font-bold text-base ${viewing.status === "anulado" ? "line-through text-muted-foreground" : "text-[#D4AF37]"}`}>
                    {fmtMoney(viewing.amount, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoría:</span>
                  <span className="font-medium text-foreground">{CATEGORY_LABELS[viewing.category]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <span className={`font-semibold uppercase ${viewing.status === "anulado" ? "text-rose-400" : "text-emerald-400"}`}>
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
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> Registrado por:</span>
                  <span className="font-medium text-foreground">{viewing.registeredBy || "Administrador"}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className || ""}`}><Label className="text-xs font-medium text-neutral-300">{label}</Label>{children}</div>;
}

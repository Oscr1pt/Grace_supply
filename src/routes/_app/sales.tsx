import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useSupabaseTable, useSupabaseView, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Sale, SaleLine } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Ban, Receipt as ReceiptIcon, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { PersistenceError, userPersistenceMessage } from "@/lib/persistence.js";
import { getConfirmedBusinessOperation, postBusinessOperation, runFinancialCorrection } from "@/lib/businessOperations";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

function SalesPage() {
  const { data: sales, refresh: refreshSales } = useSupabaseTable<Sale>("sales");
  const { data: clients } = useSupabaseView("sales_client_lookup");
  const { data: inventory, refresh: refreshInventory } = useSupabaseView("sales_inventory_lookup");
  const requestKey = useRef<string | null>(null);
  const [settings] = useSettings();
  const { user } = useAuth();
  const annulKeys = useRef(new Map<string, string>());

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [pickItem, setPickItem] = useState("");
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [dueDate, setDueDate] = useState<string>("");
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [pending, setPending] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const tax = +(subtotal * (settings.taxRate / 100)).toFixed(2);
  const total = subtotal + tax;

  const addLine = () => {
    const item = inventory.find((i) => i.id === pickItem);
    if (!item) return;
    if (item.quantity < 1) { toast.error("Sin existencia"); return; }
    const existing = lines.find((l) => l.itemId === item.id);
    if (existing) {
      setLines(lines.map((l) => l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l));
    } else {
      setLines([...lines, { itemId: item.id, sku: item.sku, name: item.name, unitPrice: item.price, quantity: 1 }]);
    }
    setPickItem("");
  };

  const removeLine = (id: string) => setLines(lines.filter((l) => l.itemId !== id));
  const setQty = (id: string, q: number) => setLines(lines.map((l) => l.itemId === id ? { ...l, quantity: Math.max(1, q) } : l));

  const reset = () => {
    setClientId("");
    setLines([]);
    setPickItem("");
    setPaymentType("contado");
    setDueDate("");
  };

  const save = async () => {
    if (pending || needsReconciliation) return;
    if (!clientId) { toast.error("Selecciona un cliente"); return; }
    if (lines.length === 0) { toast.error("Agrega al menos un producto"); return; }
    setPending(true);
    const idempotencyKey = requestKey.current ?? globalThis.crypto.randomUUID();
    requestKey.current = idempotencyKey;
    try {
      const result = await postBusinessOperation("sale", {
        idempotency_key: idempotencyKey, client_id: clientId, payment_type: paymentType,
        due_date: paymentType === "credito" ? dueDate || null : null,
        lines: lines.map((line) => ({ item_id: line.itemId, quantity: line.quantity, expected_unit_price: line.unitPrice.toFixed(2) })),
      });
      requestKey.current = null;
      const sale: Sale = { id: String(result.sale_id), receiptNo: String(result.receipt_no), clientId, lines,
        subtotal: Number(result.subtotal), taxRate: Number(result.tax_rate ?? 0), tax: Number(result.tax), total: Number(result.total),
        paymentType, dueDate: paymentType === "credito" ? dueDate : undefined, createdAt: new Date().toISOString() };
      void refreshSales();
      void refreshInventory();
      toast.success(paymentType === "credito" ? "Venta y cuenta por cobrar confirmadas" : "Venta confirmada");
      setOpen(false); reset(); setViewing(sale);
    } catch (e) {
      const uncertain = e instanceof PersistenceError && e.kind === "uncertain";
      if (uncertain) setNeedsReconciliation(true); else requestKey.current = null;
      toast.error(userPersistenceMessage(e));
    } finally { setPending(false); }
  };

  const reconcileSale = async () => {
    const key = requestKey.current;
    if (!key || pending) return;
    setPending(true);
    try {
      const result = await getConfirmedBusinessOperation("sale", key);
      if (!result) { toast.error("La operación todavía no aparece confirmada. Conserva este formulario y vuelve a consultar."); return; }
      const savedLines = Array.isArray(result.lines) ? result.lines as Array<Record<string, unknown>> : [];
      const sale: Sale = {
        id: String(result.sale_id), receiptNo: String(result.receipt_no), clientId: String(result.client_id),
        lines: savedLines.map((line) => ({
          itemId: String(line.item_id), sku: String(line.sku), name: String(line.name),
          unitPrice: Number(line.unit_price), quantity: Number(line.quantity),
        })),
        subtotal: Number(result.subtotal), taxRate: Number(result.tax_rate), tax: Number(result.tax), total: Number(result.total),
        paymentType: result.payment_type === "credito" ? "credito" : "contado",
        dueDate: typeof result.due_date === "string" ? result.due_date : undefined,
        createdAt: new Date().toISOString(),
      };
      requestKey.current = null; setNeedsReconciliation(false);
      void refreshSales(); void refreshInventory();
      toast.success("Venta confirmada y reconciliada"); setOpen(false); reset(); setViewing(sale);
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally { setPending(false); }
  };

  const remove = async (id: string) => {
    if (user?.role !== "admin") { toast.error("Solo un administrador activo puede anular ventas."); return; }
    const reason = window.prompt("Motivo obligatorio para anular esta venta:");
    if (!reason?.trim()) { toast.error("La anulación requiere un motivo."); return; }
    try {
      const key = annulKeys.current.get(id) ?? globalThis.crypto.randomUUID();
      annulKeys.current.set(id, key);
      await runFinancialCorrection("financial_annulment", { idempotency_key: key, document_type: "sale", document_id: id, reason: reason.trim() });
      annulKeys.current.delete(id);
      void refreshSales(); void refreshInventory();
      toast.success("Venta anulada con compensación persistida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Emite recibos, controla ingresos y registra ventas a contado o crédito."
        actions={
          <Dialog open={open} onOpenChange={(o) => { if (!o && needsReconciliation) return; setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                <Plus className="h-4 w-4 mr-1.5" /> Nueva venta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nueva venta</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Cliente</Label>
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger><SelectValue placeholder={clients.length ? "Elige un cliente" : "Agrega primero un cliente"} /></SelectTrigger>
                      <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Método de Pago</Label>
                    <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "contado" | "credito")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado (Inmediato)</SelectItem>
                        <SelectItem value="credito">Crédito (Genera Deuda)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {paymentType === "credito" && (
                  <div className="p-3 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/5 space-y-2">
                    <div className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                      Venta a Crédito — Cuenta por Cobrar
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fecha de vencimiento (opcional)</Label>
                      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-border">
                  <div className="p-3 flex gap-2 border-b border-border bg-muted/30">
                    <Select value={pickItem} onValueChange={setPickItem}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecciona producto para agregar" /></SelectTrigger>
                      <SelectContent>
                        {inventory.filter((i) => i.quantity > 0).map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.sku} — {i.name} ({fmtMoney(i.price, settings.currency)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={addLine} disabled={!pickItem} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"><Plus /> Agregar</Button>
                  </div>
                  {lines.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Sin productos agregados.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2">Producto</th>
                          <th className="text-right px-3 py-2 w-24">Precio</th>
                          <th className="text-right px-3 py-2 w-20">Cant.</th>
                          <th className="text-right px-3 py-2 w-28">Total</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.itemId} className="border-t border-border">
                            <td className="px-3 py-2"><div className="font-medium">{l.name}</div><div className="text-xs text-muted-foreground font-mono">{l.sku}</div></td>
                            <td className="px-3 py-2 text-right font-mono">{fmtMoney(l.unitPrice, settings.currency)}</td>
                            <td className="px-3 py-2 text-right">
                              <Input type="number" min={1} value={l.quantity} onChange={(e) => setQty(l.itemId, +e.target.value)} className="h-8 w-16 ml-auto text-right" />
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{fmtMoney(l.unitPrice * l.quantity, settings.currency)}</td>
                            <td className="px-3 py-2"><Button size="icon" variant="ghost" onClick={() => removeLine(l.itemId)}><X className="h-4 w-4" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="ml-auto w-64 space-y-1 text-sm">
                  <Row label="Subtotal" value={fmtMoney(subtotal, settings.currency)} />
                  <Row label={`Impuesto (${settings.taxRate}%)`} value={fmtMoney(tax, settings.currency)} />
                  <div className="h-px bg-border my-1" />
                  <Row label="Estimado" value={fmtMoney(total, settings.currency)} bold />
                  <p className="text-xs text-muted-foreground">El servidor calculará y confirmará el importe antes de registrar la venta.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending || needsReconciliation}>Cancelar</Button>
                <p role="status" className="mr-auto text-sm text-muted-foreground">Venta, stock y crédito se confirman en una operación.</p>
                {needsReconciliation && <p role="alert" className="text-sm text-destructive">No se recibió confirmación. No repitas la venta; consulta el resultado con la misma clave.</p>}
                {needsReconciliation && <Button variant="outline" onClick={reconcileSale} disabled={pending}>Consultar operación</Button>}
                <Button onClick={save} disabled={pending || needsReconciliation} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                  {pending ? "Confirmando…" : "Confirmar venta"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Recibo #</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-right px-4 py-3">Piezas</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Aún no hay ventas.</td></tr>
            ) : sales.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{s.receiptNo}</td>
                <td className="px-4 py-3">{clientName(s.clientId)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(s.createdAt)}</td>
                <td className="px-4 py-3 text-right">{s.lines.reduce((a, b) => a + b.quantity, 0)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtMoney(s.total, settings.currency)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setViewing(s)} title="Recibo"><ReceiptIcon className="h-4 w-4" /></Button>
                    {s.voidedAt ? <span className="px-2 text-xs text-rose-400">Anulada</span> : user?.role === "admin" && <Button size="icon" variant="ghost" onClick={() => remove(s.id)} title="Anular venta"><Ban className="h-4 w-4" /></Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReceiptDialog sale={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : "text-muted-foreground"}`}>
      <span>{label}</span><span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function ReceiptDialog({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [settings] = useSettings();
  const { data: clients } = useSupabaseView("sales_client_lookup");
  if (!sale) return null;
  const client = clients.find((c) => c.id === sale.clientId);
  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="no-print"><DialogTitle>Recibo {sale.receiptNo}</DialogTitle></DialogHeader>
        <div id="receipt-print" className="bg-white text-black p-6 rounded-md font-sans">
          <div className="text-center border-b border-gray-300 pb-3">
            <div className="font-display text-2xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{settings.businessName}</div>
            <div className="text-xs text-gray-600 mt-1">{settings.businessAddress}</div>
            <div className="text-xs text-gray-600">{settings.businessPhone}</div>
          </div>
          <div className="flex justify-between text-xs mt-3">
            <div>
              <div className="text-gray-500 uppercase tracking-wider">Cliente</div>
              <div className="font-medium text-sm">{client?.name || "Mostrador"}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-500 uppercase tracking-wider">Recibo</div>
              <div className="font-mono text-sm">{sale.receiptNo}</div>
              <div>{new Date(sale.createdAt).toLocaleString()}</div>
            </div>
          </div>
          <table className="w-full text-xs mt-4">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-2">Pieza</th>
                <th className="text-right py-2">Cant.</th>
                <th className="text-right py-2">Precio</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l) => (
                <tr key={l.itemId} className="border-b border-gray-200">
                  <td className="py-2">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-gray-500 font-mono">{l.sku}</div>
                  </td>
                  <td className="py-2 text-right">{l.quantity}</td>
                  <td className="py-2 text-right font-mono">{fmtMoney(l.unitPrice, settings.currency)}</td>
                  <td className="py-2 text-right font-mono">{fmtMoney(l.unitPrice * l.quantity, settings.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto w-56 mt-3 text-xs space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{fmtMoney(sale.subtotal, settings.currency)}</span></div>
            <div className="flex justify-between"><span>Impuesto ({sale.taxRate}%)</span><span className="font-mono">{fmtMoney(sale.tax, settings.currency)}</span></div>
            <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold text-sm"><span>Total</span><span className="font-mono">{fmtMoney(sale.total, settings.currency)}</span></div>
          </div>
          <div className="text-center text-xs text-gray-500 mt-6 border-t border-gray-300 pt-3">
            Gracias por su compra en {settings.businessName}.
          </div>
        </div>
        <DialogFooter className="no-print">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={() => window.print()}><Printer /> Imprimir recibo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

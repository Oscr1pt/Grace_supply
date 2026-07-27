import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSupabaseTable, uid, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Sale, SaleLine, Client, InventoryItem } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Receipt as ReceiptIcon, Printer, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

function genReceiptNo() {
  const d = new Date();
  return `R-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function SalesPage() {
  const { data: sales, insert: insertSale, remove: removeSale } = useSupabaseTable<Sale>("sales");
  const { data: clients } = useSupabaseTable<Client>("clients");
  const { data: inventory, update: updateInventory } = useSupabaseTable<InventoryItem>("inventory");
  const [settings] = useSettings();

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [pickItem, setPickItem] = useState("");
  const [viewing, setViewing] = useState<Sale | null>(null);

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

  const reset = () => { setClientId(""); setLines([]); setPickItem(""); };

  const save = async () => {
    if (!clientId) { toast.error("Selecciona un cliente"); return; }
    if (lines.length === 0) { toast.error("Agrega al menos una pieza"); return; }
    try {
      // Deduct inventory quantities
      await Promise.all(
        lines.map((ln) => {
          const item = inventory.find((i) => i.id === ln.itemId);
          if (item) return updateInventory(item.id, { quantity: Math.max(0, item.quantity - ln.quantity) });
        }).filter(Boolean),
      );
      const sale: Sale = {
        id: uid(),
        receiptNo: genReceiptNo(),
        clientId, lines, subtotal, taxRate: settings.taxRate, tax, total,
        createdAt: new Date().toISOString(),
      };
      await insertSale(sale);
      toast.success("Venta registrada");
      setOpen(false);
      reset();
      setViewing(sale);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar venta");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta venta? El inventario no se restaurará.")) return;
    try {
      await removeSale(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Emite recibos y controla los ingresos."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button><Plus /> Nueva venta</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nueva venta</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder={clients.length ? "Elige un cliente" : "Agrega primero un cliente"} /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border border-border">
                  <div className="p-3 flex gap-2 border-b border-border bg-muted/30">
                    <Select value={pickItem} onValueChange={setPickItem}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecciona pieza para agregar" /></SelectTrigger>
                      <SelectContent>
                        {inventory.filter((i) => i.quantity > 0).map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.sku} — {i.name} ({fmtMoney(i.price, settings.currency)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={addLine} disabled={!pickItem}><Plus /> Agregar</Button>
                  </div>
                  {lines.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Sin piezas agregadas.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2">Pieza</th>
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
                  <Row label="Total" value={fmtMoney(total, settings.currency)} bold />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save}>Registrar venta y generar recibo</Button>
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
                    <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
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
  const { data: clients } = useSupabaseTable<Client>("clients");
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
              {client?.email && <div>{client.email}</div>}
              {client?.phone && <div>{client.phone}</div>}
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

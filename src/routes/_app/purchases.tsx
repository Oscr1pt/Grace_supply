import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSupabaseTable, uid, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Purchase, InventoryItem } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/purchases")({
  component: PurchasesPage,
});

const empty: Omit<Purchase, "id" | "createdAt" | "total"> = {
  supplier: "", itemId: "", description: "", quantity: 1, unitCost: 0,
};

function PurchasesPage() {
  const { data: purchases, insert: insertPurchase, remove: removePurchase } = useSupabaseTable<Purchase>("purchases");
  const { data: inventory, update: updateInventory } = useSupabaseTable<InventoryItem>("inventory");
  const { data: suppliers } = useSupabaseTable<Supplier>("suppliers");
  const { insert: insertSupplierCredit } = useSupabaseTable<SupplierCredit>("supplier_credits");
  const [settings] = useSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [supplierId, setSupplierId] = useState("");
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [restock, setRestock] = useState(true);

  const save = async () => {
    const selectedSup = suppliers.find((s) => s.id === supplierId);
    const supplierName = selectedSup ? selectedSup.name : form.supplier.trim();

    if (!supplierName) { toast.error("El proveedor es obligatorio"); return; }
    const total = form.quantity * form.unitCost;
    const purchaseId = uid();
    const invNo = invoiceNo.trim() || `COMP-${purchaseId.slice(0, 6).toUpperCase()}`;

    try {
      const purchase: Purchase = {
        id: purchaseId,
        createdAt: new Date().toISOString(),
        supplier: supplierName,
        supplierId: selectedSup?.id,
        paymentType,
        invoiceNo: invNo,
        dueDate: paymentType === "credito" ? dueDate : undefined,
        total,
        ...form,
      };

      await insertPurchase(purchase);

      if (restock && form.itemId) {
        const item = inventory.find((i) => i.id === form.itemId);
        if (item) await updateInventory(item.id, { quantity: item.quantity + form.quantity });
      }

      // If Purchase is on Credit, automatically generate a SupplierCredit (Cuenta por Pagar)
      if (paymentType === "credito") {
        await insertSupplierCredit({
          id: uid(),
          purchaseId,
          supplierId: selectedSup?.id,
          supplierName,
          invoiceNo: invNo,
          total,
          paid: 0,
          balance: total,
          status: "pendiente",
          dueDate: dueDate || undefined,
          createdAt: new Date().toISOString(),
        });
        toast.success("Compra a crédito registrada y cuenta por pagar creada");
      } else {
        toast.success("Compra registrada");
      }

      setOpen(false);
      setForm(empty);
      setSupplierId("");
      setPaymentType("contado");
      setInvoiceNo("");
      setDueDate("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta compra?")) return;
    try {
      await removePurchase(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const itemName = (id?: string) => inventory.find((i) => i.id === id)?.name;

  return (
    <div>
      <PageHeader
        title="Compras"
        description="Reabastecimientos de productos y gastos con proveedores (Contado / Crédito)."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                <Plus className="h-4 w-4 mr-1.5" /> Nueva compra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nueva compra</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Proveedor registrado">
                    <Select value={supplierId} onValueChange={(v) => {
                      setSupplierId(v);
                      const s = suppliers.find((x) => x.id === v);
                      if (s) setForm({ ...form, supplier: s.name });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Elige un proveedor" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} (RNC: {s.rnc || "N/A"})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Nombre del Proveedor (si no está en lista)">
                    <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Distribuidora Grace & Barber S.A." />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Método de Pago">
                    <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "contado" | "credito")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado (Pagado)</SelectItem>
                        <SelectItem value="credito">Crédito (Genera Deuda)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Nº Factura Proveedor">
                    <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="COMP-00249" />
                  </Field>
                </div>

                {paymentType === "credito" && (
                  <div className="p-3 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/5 space-y-1">
                    <Label className="text-xs font-semibold text-[#D4AF37]">Fecha de vencimiento del crédito (opcional)</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
                  </div>
                )}

                <Field label="Producto de inventario vinculado (opcional)">
                  <Select value={form.itemId || "none"} onValueChange={(v) => setForm({ ...form, itemId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Ninguno —</SelectItem>
                      {inventory.map((i) => <SelectItem key={i.id} value={i.id}>{i.sku} — {i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Descripción de la compra">
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Pomadas mate 150ml, Tijeras profesionales 7.5'..." />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cantidad"><Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(1, +e.target.value) })} /></Field>
                  <Field label="Costo unitario"><Input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Math.max(0, +e.target.value) })} /></Field>
                </div>

                {form.itemId && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                    Sumar automáticamente {form.quantity} unidad(es) al stock del producto
                  </label>
                )}
                <div className="text-right text-sm">
                  Total: <span className="font-mono font-semibold">{fmtMoney(form.quantity * form.unitCost, settings.currency)}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">Registrar compra</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Proveedor</th>
              <th className="text-left px-4 py-3">Producto / descripción</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-right px-4 py-3">Cant.</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Aún no hay compras.</td></tr>
            ) : purchases.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{p.supplier}</td>
                <td className="px-4 py-3">
                  {itemName(p.itemId) && <div className="text-xs text-primary">{itemName(p.itemId)}</div>}
                  <div className="text-muted-foreground text-xs">{p.description || "—"}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(p.createdAt)}</td>
                <td className="px-4 py-3 text-right">{p.quantity}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtMoney(p.total, settings.currency)}</td>
                <td className="px-4 py-3">
                  <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
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

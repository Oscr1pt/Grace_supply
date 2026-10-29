import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useSupabaseTable, useSupabaseView, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Purchase } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Ban } from "lucide-react";
import { toast } from "sonner";
import { PersistenceError, userPersistenceMessage } from "@/lib/persistence.js";
import {
  getConfirmedBusinessOperation,
  postBusinessOperation,
  runFinancialCorrection,
} from "@/lib/businessOperations";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/purchases")({
  component: PurchasesPage,
});

const empty: Omit<Purchase, "id" | "createdAt" | "total"> = {
  supplier: "",
  itemId: "",
  description: "",
  quantity: 1,
  unitCost: 0,
};

function PurchasesPage() {
  const { data: purchases, refresh: refreshPurchases } = useSupabaseTable<Purchase>("purchases");
  const { data: inventory, refresh: refreshInventory } = useSupabaseView("sales_inventory_lookup");
  const { data: suppliers } = useSupabaseView("purchases_supplier_lookup");
  const requestKey = useRef<string | null>(null);
  const [settings] = useSettings();
  const { user } = useAuth();
  const annulKeys = useRef(new Map<string, string>());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [supplierId, setSupplierId] = useState("");
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [restock, setRestock] = useState(true);
  const [pending, setPending] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);

  const save = async () => {
    if (pending || needsReconciliation) return;
    const selectedSup = suppliers.find((s) => s.id === supplierId);
    const supplierName = selectedSup ? selectedSup.name : form.supplier.trim();
    if (!supplierName) {
      toast.error("El proveedor es obligatorio");
      return;
    }
    if (paymentType === "credito" && !selectedSup) {
      toast.error("El crédito requiere seleccionar un proveedor registrado");
      return;
    }
    setPending(true);
    const idempotencyKey = requestKey.current ?? globalThis.crypto.randomUUID();
    requestKey.current = idempotencyKey;
    const invNo = invoiceNo.trim() || "COMP-" + idempotencyKey.slice(0, 8).toUpperCase();
    try {
      await postBusinessOperation("purchase", {
        idempotency_key: idempotencyKey,
        supplier_id: selectedSup?.id ?? null,
        supplier_name: supplierName,
        item_id: form.itemId || null,
        description: form.description,
        quantity: form.quantity,
        unit_cost: Number(form.unitCost).toFixed(2),
        restock: Boolean(restock && form.itemId),
        payment_type: paymentType,
        invoice_no: invNo,
        due_date: paymentType === "credito" ? dueDate || null : null,
      });
      requestKey.current = null;
      void refreshPurchases();
      void refreshInventory();
      toast.success(
        paymentType === "credito" ? "Compra y cuenta por pagar confirmadas" : "Compra confirmada",
      );
      setOpen(false);
      setForm(empty);
      setSupplierId("");
      setPaymentType("contado");
      setInvoiceNo("");
      setDueDate("");
    } catch (e) {
      const uncertain = e instanceof PersistenceError && e.kind === "uncertain";
      if (uncertain) setNeedsReconciliation(true);
      else requestKey.current = null;
      toast.error(userPersistenceMessage(e));
    } finally {
      setPending(false);
    }
  };

  const reconcilePurchase = async () => {
    const key = requestKey.current;
    if (!key || pending) return;
    setPending(true);
    try {
      const result = await getConfirmedBusinessOperation("purchase", key);
      if (!result) {
        toast.error(
          "La operación todavía no aparece confirmada. Conserva el formulario y vuelve a consultar.",
        );
        return;
      }
      requestKey.current = null;
      setNeedsReconciliation(false);
      void refreshPurchases();
      void refreshInventory();
      toast.success("Compra reconciliada con el resultado persistido");
      setOpen(false);
      setForm(empty);
      setSupplierId("");
      setPaymentType("contado");
      setInvoiceNo("");
      setDueDate("");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    if (user?.role !== "admin") {
      toast.error("Solo un administrador activo puede anular compras.");
      return;
    }
    const reason = window.prompt("Motivo obligatorio para anular esta compra:");
    if (!reason?.trim()) {
      toast.error("La anulación requiere un motivo.");
      return;
    }
    try {
      const key = annulKeys.current.get(id) ?? globalThis.crypto.randomUUID();
      annulKeys.current.set(id, key);
      await runFinancialCorrection("financial_annulment", {
        idempotency_key: key,
        document_type: "purchase",
        document_id: id,
        reason: reason.trim(),
      });
      annulKeys.current.delete(id);
      void refreshPurchases();
      void refreshInventory();
      toast.success("Compra anulada con compensación persistida");
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
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!value && needsReconciliation) return;
              setOpen(value);
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                <Plus className="h-4 w-4 mr-1.5" /> Nueva compra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva compra</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Proveedor registrado" labelId="purchase-supplier-registered-label">
                    <Select
                      value={supplierId}
                      onValueChange={(v) => {
                        setSupplierId(v);
                        const s = suppliers.find((x) => x.id === v);
                        if (s) setForm({ ...form, supplier: s.name });
                      }}
                    >
                      <SelectTrigger aria-labelledby="purchase-supplier-registered-label">
                        <SelectValue placeholder="Elige un proveedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    label="Nombre del Proveedor (si no está en lista)"
                    htmlFor="purchase-supplier-name"
                  >
                    <Input
                      id="purchase-supplier-name"
                      value={form.supplier}
                      onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                      placeholder="Distribuidora Grace & Barber S.A."
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Método de Pago" labelId="purchase-payment-method-label">
                    <Select
                      value={paymentType}
                      onValueChange={(v) => setPaymentType(v as "contado" | "credito")}
                    >
                      <SelectTrigger aria-labelledby="purchase-payment-method-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado (Pagado)</SelectItem>
                        <SelectItem value="credito">Crédito (Genera Deuda)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Nº Factura Proveedor" htmlFor="purchase-invoice-number">
                    <Input
                      id="purchase-invoice-number"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="COMP-00249"
                    />
                  </Field>
                </div>

                {paymentType === "credito" && (
                  <div className="p-3 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/5 space-y-1">
                    <Label
                      htmlFor="purchase-credit-due-date"
                      className="text-xs font-semibold text-[#D4AF37]"
                    >
                      Fecha de vencimiento del crédito (opcional)
                    </Label>
                    <Input
                      id="purchase-credit-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                )}

                <Field
                  label="Producto de inventario vinculado (opcional)"
                  labelId="purchase-inventory-product-label"
                >
                  <Select
                    value={form.itemId || "none"}
                    onValueChange={(v) => setForm({ ...form, itemId: v === "none" ? "" : v })}
                  >
                    <SelectTrigger aria-labelledby="purchase-inventory-product-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Ninguno —</SelectItem>
                      {inventory.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.sku} — {i.name} · Stock {i.quantity} ·{" "}
                          {fmtMoney(i.price, settings.currency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Descripción de la compra" htmlFor="purchase-description">
                  <Input
                    id="purchase-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Pomadas mate 150ml, Tijeras profesionales 7.5'..."
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cantidad" htmlFor="purchase-quantity">
                    <Input
                      id="purchase-quantity"
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: Math.max(1, +e.target.value) })}
                    />
                  </Field>
                  <Field label="Costo unitario" htmlFor="purchase-unit-cost">
                    <Input
                      id="purchase-unit-cost"
                      type="number"
                      step="0.01"
                      value={form.unitCost}
                      onChange={(e) => setForm({ ...form, unitCost: Math.max(0, +e.target.value) })}
                    />
                  </Field>
                </div>

                {form.itemId && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <input
                      type="checkbox"
                      checked={restock}
                      onChange={(e) => setRestock(e.target.checked)}
                    />
                    Sumar automáticamente {form.quantity} unidad(es) al stock del producto
                  </label>
                )}
                <div className="text-right text-sm">
                  Total:{" "}
                  <span className="font-mono font-semibold">
                    {fmtMoney(form.quantity * form.unitCost, settings.currency)}
                  </span>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending || needsReconciliation}
                >
                  Cancelar
                </Button>
                <p role="status" className="mr-auto text-sm text-muted-foreground">
                  Compra, reposición y crédito se confirman en una operación.
                </p>
                {needsReconciliation && (
                  <p role="alert" className="text-sm text-destructive">
                    No se recibió confirmación. No repitas la compra; consulta el resultado con la
                    misma clave.
                  </p>
                )}
                {needsReconciliation && (
                  <Button variant="outline" onClick={reconcilePurchase} disabled={pending}>
                    Consultar operación
                  </Button>
                )}
                <Button
                  onClick={save}
                  disabled={pending || needsReconciliation}
                  className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                >
                  {pending ? "Confirmando?" : "Confirmar compra"}
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
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Aún no hay compras.
                </td>
              </tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.supplier}</td>
                  <td className="px-4 py-3">
                    {itemName(p.itemId) && (
                      <div className="text-xs text-primary">{itemName(p.itemId)}</div>
                    )}
                    <div className="text-muted-foreground text-xs">{p.description || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(p.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">{p.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtMoney(p.total, settings.currency)}
                  </td>
                  <td className="px-4 py-3">
                    {p.voidedAt ? (
                      <span className="px-2 text-xs text-rose-400">Anulada</span>
                    ) : (
                      user?.role === "admin" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(p.id)}
                          title="Anular compra"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  htmlFor,
  labelId,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
  labelId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} id={labelId}>
        {label}
      </Label>
      {children}
    </div>
  );
}

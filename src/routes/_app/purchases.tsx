import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  clearPendingBusinessOperation,
  persistPendingBusinessOperation,
  readPendingBusinessOperation,
} from "@/lib/pendingBusinessOperation.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { validatePurchaseDraft } from "@/lib/businessDocumentValidation.js";

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
const quickPurchaseSupplier = "Proveedor no identificado";

function PurchasesPage() {
  const {
    data: purchases,
    refresh: refreshPurchases,
    loading: purchasesLoading,
    loadError: purchasesError,
  } = useSupabaseTable<Purchase>("purchases");
  const {
    data: inventory,
    refresh: refreshInventory,
    loading: inventoryLoading,
    loadError: inventoryError,
  } = useSupabaseView("sales_inventory_lookup");
  const {
    data: suppliers,
    refresh: refreshSuppliers,
    loading: suppliersLoading,
    loadError: suppliersError,
  } = useSupabaseView("purchases_supplier_lookup");
  const requestKey = useRef<string | null>(null);
  const submitLock = useRef(false);
  const annulLock = useRef(false);
  const [settings] = useSettings();
  const { user } = useAuth();
  const annulKeys = useRef(new Map<string, string>());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [supplierId, setSupplierId] = useState("");
  const [quickPurchase, setQuickPurchase] = useState(false);
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [restock, setRestock] = useState(true);
  const [pending, setPending] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [purchaseValidationErrors, setPurchaseValidationErrors] = useState<Record<string, string>>(
    {},
  );
  const [pendingOperationType, setPendingOperationType] = useState<string | null>(null);
  const [pendingOperationError, setPendingOperationError] = useState<string | null>(null);
  const [annulTarget, setAnnulTarget] = useState<Purchase | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [annulPending, setAnnulPending] = useState(false);
  const [annulUncertain, setAnnulUncertain] = useState(false);

  useEffect(() => {
    if (!user?.authUserId || typeof window === "undefined") return;
    try {
      const operation = readPendingBusinessOperation(window.sessionStorage, user.authUserId);
      if (!operation) return;
      setPendingOperationType(operation.type);
      if (
        operation.type === "financial_annulment" &&
        operation.request.document_type === "purchase"
      ) {
        const context = operation.context as { document?: Purchase; reason?: string } | undefined;
        annulKeys.current.set(String(operation.request.document_id), operation.idempotencyKey);
        if (context?.document) setAnnulTarget(context.document);
        if (context?.reason) setAnnulReason(context.reason);
        setAnnulUncertain(true);
        return;
      }
      if (operation.type !== "purchase") return;
      requestKey.current = operation.idempotencyKey;
      setNeedsReconciliation(true);
      setOpen(true);
      const context = operation.context as
        | {
            form?: typeof empty;
            supplierId?: string;
            quickPurchase?: boolean;
            paymentType?: "contado" | "credito";
            invoiceNo?: string;
            dueDate?: string;
            restock?: boolean;
          }
        | undefined;
      if (context?.form) setForm(context.form);
      if (context?.supplierId) setSupplierId(context.supplierId);
      if (typeof context?.quickPurchase === "boolean") setQuickPurchase(context.quickPurchase);
      if (context?.paymentType) setPaymentType(context.paymentType);
      if (context?.invoiceNo) setInvoiceNo(context.invoiceNo);
      if (context?.dueDate) setDueDate(context.dueDate);
      if (typeof context?.restock === "boolean") setRestock(context.restock);
    } catch (error) {
      setPendingOperationType("unreadable");
      setNeedsReconciliation(true);
      setPendingOperationError(
        error instanceof Error
          ? error.message
          : "Existe una operación pendiente que requiere revisión.",
      );
    }
  }, [user?.authUserId]);

  const save = async () => {
    if (submitLock.current || pending || needsReconciliation || pendingOperationType) return;
    const selectedSup = quickPurchase ? undefined : suppliers.find((s) => s.id === supplierId);
    const supplierName = quickPurchase
      ? quickPurchaseSupplier
      : selectedSup
        ? selectedSup.name
        : form.supplier.trim();
    const cost = Number(form.unitCost);
    if (!user?.authUserId) {
      toast.error("La sesión no está confirmada. Inicia sesión antes de registrar la compra.");
      return;
    }
    const errors = validatePurchaseDraft({
      supplierId,
      supplierName,
      suppliers,
      paymentType,
      invoiceNo,
      dueDate,
      description: form.description,
      itemId: form.itemId ?? "",
      inventory,
      quantity: form.quantity,
      unitCost: cost,
      restock: restock && Boolean(form.itemId),
      quickPurchase,
    });
    if (inventoryError && form.itemId)
      errors.itemId =
        "No se pudo confirmar el artículo de inventario. Actualiza la lista antes de continuar.";
    setPurchaseValidationErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    submitLock.current = true;
    setPending(true);
    const idempotencyKey = requestKey.current ?? globalThis.crypto.randomUUID();
    requestKey.current = idempotencyKey;
    const invNo = invoiceNo.trim() || "COMP-" + idempotencyKey.slice(0, 8).toUpperCase();
    const request = {
      idempotency_key: idempotencyKey,
      supplier_id: quickPurchase ? null : (selectedSup?.id ?? null),
      supplier_name: supplierName,
      item_id: form.itemId || null,
      description: form.description.trim(),
      quantity: Number(form.quantity),
      unit_cost: cost.toFixed(2),
      restock: Boolean(restock && form.itemId),
      payment_type: paymentType,
      invoice_no: invNo,
      due_date: paymentType === "credito" ? dueDate || null : null,
    };
    try {
      if (typeof window === "undefined")
        throw new Error("No se puede conservar la operación pendiente en este entorno.");
      persistPendingBusinessOperation(window.sessionStorage, user.authUserId, {
        type: "purchase",
        idempotencyKey,
        request,
        context: {
          form,
          supplierId,
          quickPurchase,
          paymentType,
          invoiceNo: invNo,
          dueDate,
          restock,
        },
      });
      setPendingOperationType("purchase");
      await postBusinessOperation("purchase", request);
      clearPendingBusinessOperation(window.sessionStorage, user.authUserId, idempotencyKey);
      requestKey.current = null;
      setPendingOperationType(null);
      void refreshPurchases();
      void refreshInventory();
      toast.success(
        paymentType === "credito" ? "Compra y cuenta por pagar confirmadas" : "Compra confirmada",
      );
      setOpen(false);
      setForm(empty);
      setSupplierId("");
      setQuickPurchase(false);
      setPaymentType("contado");
      setInvoiceNo("");
      setDueDate("");
    } catch (e) {
      const uncertain = e instanceof PersistenceError && e.kind === "uncertain";
      if (uncertain) setNeedsReconciliation(true);
      else {
        if (typeof window !== "undefined" && user?.authUserId)
          clearPendingBusinessOperation(window.sessionStorage, user.authUserId, idempotencyKey);
        requestKey.current = null;
        setPendingOperationType(null);
      }
      toast.error(userPersistenceMessage(e));
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  };

  const reconcilePurchase = async () => {
    const key = requestKey.current;
    if (!key || pending || !user?.authUserId || pendingOperationType !== "purchase") return;
    setPending(true);
    try {
      const result = await getConfirmedBusinessOperation("purchase", key);
      if (!result) {
        toast.error(
          "La operación todavía no aparece confirmada. Conserva el formulario y vuelve a consultar.",
        );
        return;
      }
      clearPendingBusinessOperation(window.sessionStorage, user.authUserId, key);
      requestKey.current = null;
      setNeedsReconciliation(false);
      setPendingOperationType(null);
      void refreshPurchases();
      void refreshInventory();
      toast.success("Compra reconciliada con el resultado persistido");
      setOpen(false);
      setForm(empty);
      setSupplierId("");
      setQuickPurchase(false);
      setPaymentType("contado");
      setInvoiceNo("");
      setDueDate("");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  const confirmAnnulment = async () => {
    const document = annulTarget;
    const reason = annulReason.trim();
    if (
      !document ||
      annulLock.current ||
      annulPending ||
      pendingOperationType ||
      user?.role !== "admin"
    )
      return;
    if (!reason || reason.length > 500) {
      toast.error("Escribe un motivo de 1 a 500 caracteres.");
      return;
    }
    if (!user.authUserId) {
      toast.error("La sesión no está confirmada.");
      return;
    }
    const key = annulKeys.current.get(document.id) ?? globalThis.crypto.randomUUID();
    annulKeys.current.set(document.id, key);
    const request = {
      idempotency_key: key,
      document_type: "purchase",
      document_id: document.id,
      reason,
    };
    annulLock.current = true;
    setAnnulPending(true);
    try {
      persistPendingBusinessOperation(window.sessionStorage, user.authUserId, {
        type: "financial_annulment",
        idempotencyKey: key,
        request,
        context: { documentType: "purchase", documentId: document.id, reason, document },
      });
      setPendingOperationType("financial_annulment");
      await runFinancialCorrection("financial_annulment", request);
      clearPendingBusinessOperation(window.sessionStorage, user.authUserId, key);
      annulKeys.current.delete(document.id);
      setPendingOperationType(null);
      setAnnulTarget(null);
      setAnnulReason("");
      setAnnulUncertain(false);
      void refreshPurchases();
      void refreshInventory();
      toast.success("Compra anulada con compensación persistida.");
    } catch (error) {
      const uncertain = error instanceof PersistenceError && error.kind === "uncertain";
      setAnnulUncertain(uncertain);
      if (!uncertain) {
        clearPendingBusinessOperation(window.sessionStorage, user.authUserId, key);
        annulKeys.current.delete(document.id);
        setPendingOperationType(null);
      }
      toast.error(userPersistenceMessage(error));
    } finally {
      annulLock.current = false;
      setAnnulPending(false);
    }
  };

  const reconcileAnnulment = async () => {
    const document = annulTarget;
    const key = document ? annulKeys.current.get(document.id) : null;
    if (!document || !key || !user?.authUserId || annulPending) return;
    setAnnulPending(true);
    try {
      const result = await getConfirmedBusinessOperation("financial_annulment", key);
      if (!result) {
        toast.error(
          "La anulación todavía no aparece confirmada. Conserva el motivo y vuelve a consultar.",
        );
        return;
      }
      clearPendingBusinessOperation(window.sessionStorage, user.authUserId, key);
      annulKeys.current.delete(document.id);
      setPendingOperationType(null);
      setAnnulTarget(null);
      setAnnulReason("");
      setAnnulUncertain(false);
      void refreshPurchases();
      void refreshInventory();
      toast.success("Anulación confirmada y reconciliada.");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setAnnulPending(false);
    }
  };

  return (
    <div>
      {pendingOperationType && pendingOperationType !== "purchase" && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Hay otra operación pendiente</AlertTitle>
          <AlertDescription>
            Resuelve o reconcilia la operación {pendingOperationType} desde su pantalla antes de
            iniciar otra operación financiera.
          </AlertDescription>
        </Alert>
      )}
      {pendingOperationError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Revisión necesaria</AlertTitle>
          <AlertDescription>{pendingOperationError}</AlertDescription>
        </Alert>
      )}
      <PageHeader
        title="Compras"
        description="Reabastecimientos de productos y gastos con proveedores (Contado / Crédito)."
        actions={
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!value && (needsReconciliation || pending || pendingOperationType === "purchase"))
                return;
              setOpen(value);
            }}
          >
            <DialogTrigger asChild>
              <Button
                disabled={Boolean(pendingOperationType)}
                className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Nueva compra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva compra</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {Object.keys(purchaseValidationErrors).length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>Revisa los datos de la compra</AlertTitle>
                    <AlertDescription>
                      {Object.values(purchaseValidationErrors).map((message) => (
                        <p key={message}>{message}</p>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}
                {(suppliersError || inventoryError) && (
                  <Alert variant="destructive">
                    <AlertTitle>Algunas listas no se pudieron cargar</AlertTitle>
                    <AlertDescription>
                      {suppliersError || inventoryError}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void refreshSuppliers()}>
                          Reintentar proveedores
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void refreshInventory()}>
                          Reintentar artículos
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                {suppliersLoading && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Cargando proveedores registrados…
                  </p>
                )}
                {inventoryLoading && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Cargando artículos activos…
                  </p>
                )}
                <div className="space-y-1.5">
                  <p id="purchase-supplier-mode-label" className="text-sm font-medium leading-none">
                    Tipo de proveedor
                  </p>
                  <RadioGroup
                    value={quickPurchase ? "quick" : "supplier"}
                    onValueChange={(value) => {
                      setQuickPurchase(value === "quick");
                      setPurchaseValidationErrors({});
                    }}
                    aria-labelledby="purchase-supplier-mode-label"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                  >
                    <Label
                      htmlFor="purchase-supplier-mode-registered"
                      className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal cursor-pointer"
                    >
                      <RadioGroupItem id="purchase-supplier-mode-registered" value="supplier" />
                      <span>Con proveedor</span>
                    </Label>
                    <Label
                      htmlFor="purchase-supplier-mode-quick"
                      className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal cursor-pointer"
                    >
                      <RadioGroupItem
                        id="purchase-supplier-mode-quick"
                        value="quick"
                        disabled={paymentType !== "contado"}
                      />
                      <span>Compra rápida / Sin proveedor registrado</span>
                    </Label>
                  </RadioGroup>
                </div>

                {quickPurchase ? (
                  <div className="rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/5 p-3">
                    <p className="text-sm font-medium">{quickPurchaseSupplier}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Se registra al contado y no crea un proveedor en el catálogo. Para comprar a
                      crédito, selecciona un proveedor registrado y activo.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                      label="Proveedor registrado"
                      labelId="purchase-supplier-registered-label"
                    >
                      <Select
                        value={supplierId}
                        onValueChange={(v) => {
                          setSupplierId(v);
                          setPurchaseValidationErrors({});
                          const s = suppliers.find((x) => x.id === v);
                          if (s) setForm({ ...form, supplier: s.name });
                        }}
                      >
                        <SelectTrigger aria-labelledby="purchase-supplier-registered-label">
                          <SelectValue placeholder="Elige un proveedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id} disabled={s.status !== "activo"}>
                              {s.name} · ID {s.id.slice(0, 8)} ·{" "}
                              {s.status === "activo" ? "Activo" : "Inactivo"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {purchaseValidationErrors.supplierId && (
                        <p role="alert" className="text-xs text-destructive">
                          {purchaseValidationErrors.supplierId}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Una compra a crédito solo admite proveedores registrados activos.
                      </p>
                    </Field>

                    <Field
                      label="Nombre del Proveedor (si no está en lista)"
                      htmlFor="purchase-supplier-name"
                    >
                      <Input
                        id="purchase-supplier-name"
                        value={form.supplier}
                        onChange={(e) => {
                          setSupplierId("");
                          setPurchaseValidationErrors({});
                          setForm({ ...form, supplier: e.target.value });
                        }}
                        placeholder="Distribuidora Grace & Barber S.A."
                      />
                    </Field>
                    {purchaseValidationErrors.supplierName && (
                      <p role="alert" className="text-xs text-destructive">
                        {purchaseValidationErrors.supplierName}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Método de Pago" labelId="purchase-payment-method-label">
                    <Select
                      value={paymentType}
                      onValueChange={(v) => {
                        setPaymentType(v as "contado" | "credito");
                        setPurchaseValidationErrors({});
                      }}
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
                      aria-invalid={Boolean(purchaseValidationErrors.invoiceNo)}
                      aria-describedby="purchase-invoice-error"
                      value={invoiceNo}
                      onChange={(e) => {
                        setInvoiceNo(e.target.value);
                        setPurchaseValidationErrors({});
                      }}
                      placeholder="COMP-00249"
                    />
                    {purchaseValidationErrors.invoiceNo && (
                      <p
                        id="purchase-invoice-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {purchaseValidationErrors.invoiceNo}
                      </p>
                    )}
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
                      aria-invalid={Boolean(purchaseValidationErrors.dueDate)}
                      aria-describedby="purchase-due-date-error"
                      value={dueDate}
                      onChange={(e) => {
                        setDueDate(e.target.value);
                        setPurchaseValidationErrors({});
                      }}
                      className="h-9"
                    />
                    {purchaseValidationErrors.dueDate && (
                      <p
                        id="purchase-due-date-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {purchaseValidationErrors.dueDate}
                      </p>
                    )}
                  </div>
                )}

                <Field
                  label="Producto de inventario vinculado (opcional)"
                  labelId="purchase-inventory-product-label"
                >
                  <Select
                    value={form.itemId || "none"}
                    onValueChange={(v) => {
                      setForm({ ...form, itemId: v === "none" ? "" : v });
                      setPurchaseValidationErrors({});
                    }}
                  >
                    <SelectTrigger
                      aria-labelledby="purchase-inventory-product-label"
                      aria-invalid={Boolean(purchaseValidationErrors.itemId)}
                    >
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
                  {purchaseValidationErrors.itemId && (
                    <p role="alert" className="text-xs text-destructive">
                      {purchaseValidationErrors.itemId}
                    </p>
                  )}
                </Field>

                <Field label="Descripción de la compra" htmlFor="purchase-description">
                  <Input
                    id="purchase-description"
                    aria-invalid={Boolean(purchaseValidationErrors.description)}
                    aria-describedby="purchase-description-help purchase-description-error"
                    value={form.description}
                    onChange={(e) => {
                      setForm({ ...form, description: e.target.value });
                      setPurchaseValidationErrors({});
                    }}
                    placeholder="Pomadas mate 150ml, Tijeras profesionales 7.5'..."
                  />
                </Field>
                <p id="purchase-description-help" className="-mt-2 text-xs text-muted-foreground">
                  Usa una descripción del documento. El ID del artículo vinculado se conserva por
                  separado.
                </p>
                {purchaseValidationErrors.description && (
                  <p
                    id="purchase-description-error"
                    role="alert"
                    className="-mt-2 text-xs text-destructive"
                  >
                    {purchaseValidationErrors.description}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cantidad" htmlFor="purchase-quantity">
                    <Input
                      id="purchase-quantity"
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={form.quantity || ""}
                      aria-invalid={Boolean(purchaseValidationErrors.quantity)}
                      aria-describedby="purchase-quantity-error"
                      onChange={(e) => {
                        setForm({
                          ...form,
                          quantity: e.target.value === "" ? 0 : Number(e.target.value),
                        });
                        setPurchaseValidationErrors({});
                      }}
                    />
                    {purchaseValidationErrors.quantity && (
                      <p
                        id="purchase-quantity-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {purchaseValidationErrors.quantity}
                      </p>
                    )}
                  </Field>
                  <Field label="Costo unitario" htmlFor="purchase-unit-cost">
                    <Input
                      id="purchase-unit-cost"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.unitCost}
                      aria-invalid={Boolean(purchaseValidationErrors.unitCost)}
                      aria-describedby="purchase-unit-cost-error"
                      onChange={(e) => {
                        setForm({
                          ...form,
                          unitCost: e.target.value === "" ? 0 : Number(e.target.value),
                        });
                        setPurchaseValidationErrors({});
                      }}
                    />
                    {purchaseValidationErrors.unitCost && (
                      <p
                        id="purchase-unit-cost-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {purchaseValidationErrors.unitCost}
                      </p>
                    )}
                  </Field>
                </div>

                {form.itemId && (
                  <label className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
                    <input
                      type="checkbox"
                      checked={restock}
                      onChange={(e) => setRestock(e.target.checked)}
                    />
                    Sumar {form.quantity} unidad(es) al inventario dentro de la misma operación de
                    compra
                  </label>
                )}
                {!form.itemId && (
                  <p className="text-xs text-muted-foreground">
                    Sin artículo vinculado, esta compra no modifica existencias.
                  </p>
                )}
                <div className="text-right text-sm">
                  Total estimado:{" "}
                  <span className="font-mono font-semibold">
                    {fmtMoney(form.quantity * form.unitCost, settings.currency)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    El total definitivo lo confirma el servidor.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    setForm(empty);
                    setSupplierId("");
                    setQuickPurchase(false);
                    setPaymentType("contado");
                    setInvoiceNo("");
                    setDueDate("");
                  }}
                  disabled={
                    pending ||
                    needsReconciliation ||
                    Boolean(pendingOperationType) ||
                    suppliersLoading ||
                    inventoryLoading
                  }
                  aria-busy={pending}
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
                  disabled={
                    pending ||
                    needsReconciliation ||
                    Boolean(pendingOperationType) ||
                    suppliersLoading ||
                    inventoryLoading
                  }
                  aria-busy={pending}
                  className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                >
                  {pending ? "Confirmando…" : "Confirmar compra"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {purchasesError && (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>No se pudieron cargar las compras</AlertTitle>
          <AlertDescription>
            {purchasesError}
            <Button
              size="sm"
              variant="outline"
              className="ml-2"
              onClick={() => void refreshPurchases()}
            >
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
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
            {purchasesLoading ? (
              <tr>
                <td colSpan={6} role="status" className="text-center py-12 text-muted-foreground">
                  Cargando compras…
                </td>
              </tr>
            ) : purchasesError ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  No se muestran datos porque la lectura falló.
                </td>
              </tr>
            ) : purchases.length === 0 ? (
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
                    <div className="text-muted-foreground text-xs">
                      {p.description || "Sin descripción histórica"}
                    </div>
                    {p.itemId && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Artículo vinculado · {p.itemId.slice(0, 8)}
                      </div>
                    )}
                    {p.invoiceNo && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Factura {p.invoiceNo}
                      </div>
                    )}
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
                      <span className="px-2 text-xs text-rose-400">
                        Anulada{p.voidReason ? `: ${p.voidReason}` : ""}
                      </span>
                    ) : (
                      user?.role === "admin" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setAnnulTarget(p);
                            setAnnulReason("");
                            setAnnulUncertain(false);
                          }}
                          aria-label={`Anular compra ${p.invoiceNo || p.id}`}
                          disabled={Boolean(pendingOperationType)}
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
      <Dialog
        open={Boolean(annulTarget)}
        onOpenChange={(open) => {
          if (!open && (annulPending || annulUncertain)) return;
          if (!open) {
            setAnnulTarget(null);
            setAnnulReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Anular compra {annulTarget?.invoiceNo || annulTarget?.id}</DialogTitle>
            <DialogDescription>
              La anulación conserva el documento original y registra la compensación de crédito y
              existencias que corresponda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTitle>Documento original</AlertTitle>
              <AlertDescription>
                ID {annulTarget?.id} · Total confirmado{" "}
                {annulTarget ? fmtMoney(annulTarget.total, settings.currency) : ""}. Esta acción
                requiere autorización administrativa.
              </AlertDescription>
            </Alert>
            <Label htmlFor="purchase-annul-reason">Motivo obligatorio</Label>
            <Textarea
              id="purchase-annul-reason"
              value={annulReason}
              maxLength={500}
              aria-invalid={annulReason.trim().length === 0 || annulReason.trim().length > 500}
              aria-describedby="purchase-annul-help"
              onChange={(event) => setAnnulReason(event.target.value)}
              placeholder="Explica por qué se anula este documento"
              className="resize-none"
            />
            <p id="purchase-annul-help" className="text-xs text-muted-foreground">
              Escribe de 1 a 500 caracteres. La razón queda en el registro de auditoría.{" "}
              {annulReason.trim().length}/500
            </p>
            {annulUncertain && (
              <Alert variant="destructive">
                <AlertTitle>Resultado pendiente</AlertTitle>
                <AlertDescription>
                  No se confirmó la respuesta. Consulta la misma operación antes de cualquier nuevo
                  intento.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAnnulTarget(null);
                setAnnulReason("");
              }}
              disabled={annulPending || annulUncertain}
            >
              Cancelar
            </Button>
            {annulUncertain && (
              <Button
                variant="outline"
                onClick={reconcileAnnulment}
                disabled={annulPending}
                aria-busy={annulPending}
              >
                Consultar resultado
              </Button>
            )}
            {!annulUncertain && (
              <Button
                variant="destructive"
                onClick={confirmAnnulment}
                disabled={
                  annulPending ||
                  !annulReason.trim() ||
                  annulReason.trim().length > 500 ||
                  Boolean(pendingOperationType)
                }
                aria-busy={annulPending}
              >
                {annulPending ? "Anulando…" : "Confirmar anulación"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

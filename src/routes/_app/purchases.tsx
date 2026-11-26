import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabaseView, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Purchase } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { SearchableEntitySelect } from "@/components/SearchableEntitySelect";
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
import { Plus, Ban, Trash2 } from "lucide-react";
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
import {
  calculatePurchaseTotalCents,
  validatePurchaseDraft,
} from "@/lib/businessDocumentValidation.js";
import type {
  PurchaseDraftErrors,
  PurchaseLineFieldErrors,
} from "@/lib/businessDocumentValidation.js";
import { HistoryFilterBar } from "@/components/HistoryFilterBar";
import { HistoryPagination } from "@/components/HistoryPagination";
import { loadPurchaseHistoryLines, usePurchasesHistory } from "@/lib/historyQueries";
import type { HistoryPeriod } from "@/lib/historyDateRange.js";
import type { PurchaseHistoryLine } from "@/lib/types";

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
type PurchaseDraftLine = {
  key: string;
  kind: "linked" | "manual";
  itemId: string;
  manualName: string;
  quantity: number;
  unitCost: number;
};
type PurchaseLineErrorField = "manualName" | "itemId" | "quantity" | "unitCost";
const blankPurchaseLine = (key = "purchase-line-initial"): PurchaseDraftLine => ({
  key,
  kind: "linked",
  itemId: "",
  manualName: "",
  quantity: 1,
  unitCost: 0,
});

function newPurchaseLineKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function PurchasesPage() {
  const [historySearch, setHistorySearch] = useState("");
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyPageNumber, setHistoryPageNumber] = useState(1);
  const {
    records: purchases,
    totalCount: purchasesTotalCount,
    refresh: refreshPurchases,
    loading: purchasesLoading,
    error: purchasesError,
    dateError: purchasesDateError,
  } = usePurchasesHistory({
    search: historySearch,
    period: historyPeriod,
    from: historyFrom,
    to: historyTo,
    page: historyPageNumber,
  });
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
  const [linkedLinesMode, setLinkedLinesMode] = useState(true);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseDraftLine[]>([blankPurchaseLine()]);
  const purchaseLinesRef = useRef(purchaseLines);
  const [supplierId, setSupplierId] = useState("");
  const [quickPurchase, setQuickPurchase] = useState(false);
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [restock, setRestock] = useState(true);
  const [pending, setPending] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [purchaseValidationErrors, setPurchaseValidationErrors] = useState<PurchaseDraftErrors>({});
  const lineFieldRefs = useRef(new Map<string, Map<PurchaseLineErrorField, HTMLElement>>());
  const [pendingOperationType, setPendingOperationType] = useState<string | null>(null);
  const [pendingOperationError, setPendingOperationError] = useState<string | null>(null);
  const [annulTarget, setAnnulTarget] = useState<Purchase | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [annulPending, setAnnulPending] = useState(false);
  const [annulUncertain, setAnnulUncertain] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Purchase | null>(null);
  const [detailLines, setDetailLines] = useState<PurchaseHistoryLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const setLineFieldRef = useCallback(
    (lineKey: string, field: PurchaseLineErrorField, element: HTMLElement | null) => {
      const fields = lineFieldRefs.current.get(lineKey) ?? new Map();
      if (element) {
        fields.set(field, element);
        lineFieldRefs.current.set(lineKey, fields);
      } else {
        fields.delete(field);
        if (fields.size === 0) lineFieldRefs.current.delete(lineKey);
      }
    },
    [],
  );

  const refreshLineValidation = (lines: PurchaseDraftLine[]) => {
    const lineValidation = validatePurchaseDraft({
      supplierId,
      supplierName: suppliers.find((supplier) => supplier.id === supplierId)?.name ?? form.supplier,
      suppliers,
      paymentType,
      invoiceNo,
      dueDate,
      description: form.description,
      itemId: "",
      inventory,
      restock,
      lines: lines.map((line) => ({ ...line })),
      quickPurchase,
    });
    setPurchaseValidationErrors((current) => {
      const next = { ...current };
      delete next.lines;
      delete next.lineErrors;
      if (lineValidation.lines) next.lines = lineValidation.lines;
      if (lineValidation.lineErrors) next.lineErrors = lineValidation.lineErrors;
      return next;
    });
  };

  const clearGeneralPurchaseErrors = () => {
    setPurchaseValidationErrors((current) => ({
      ...(current.lines ? { lines: current.lines } : {}),
      ...(current.lineErrors ? { lineErrors: current.lineErrors } : {}),
    }));
  };

  const updatePurchaseLines = (update: (current: PurchaseDraftLine[]) => PurchaseDraftLine[]) => {
    const next = update(purchaseLinesRef.current);
    purchaseLinesRef.current = next;
    setPurchaseLines(next);
    if (purchaseValidationErrors.lines || purchaseValidationErrors.lineErrors) {
      refreshLineValidation(next);
    }
  };

  const replacePurchaseLines = (lines: PurchaseDraftLine[]) => {
    purchaseLinesRef.current = lines;
    setPurchaseLines(lines);
  };

  const focusFirstInvalidLineField = (
    errors: PurchaseLineFieldErrors | undefined,
    lines: PurchaseDraftLine[],
  ) => {
    if (!errors || typeof window === "undefined") return;
    const fieldOrder: PurchaseLineErrorField[] = ["manualName", "itemId", "quantity", "unitCost"];
    for (const line of lines) {
      const invalidField = fieldOrder.find((field) => errors[line.key]?.[field]);
      const element = invalidField ? lineFieldRefs.current.get(line.key)?.get(invalidField) : null;
      if (!element) continue;
      window.requestAnimationFrame(() => {
        if (!element.isConnected) return;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.focus({ preventScroll: true });
      });
      return;
    }
  };

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
            linkedLinesMode?: boolean;
            lines?: PurchaseDraftLine[];
            supplierId?: string;
            quickPurchase?: boolean;
            paymentType?: "contado" | "credito";
            invoiceNo?: string;
            dueDate?: string;
            restock?: boolean;
          }
        | undefined;
      if (context?.form) setForm(context.form);
      if (Array.isArray(context?.lines) && context.lines.length > 0) {
        replacePurchaseLines(
          context.lines.map((line) => ({
            ...line,
            kind: line.kind === "manual" ? "manual" : "linked",
            itemId: line.kind === "manual" ? "" : line.itemId,
            manualName: line.kind === "manual" ? (line.manualName ?? "") : "",
          })),
        );
        setLinkedLinesMode(context.linkedLinesMode !== false);
      } else {
        setLinkedLinesMode(false);
      }
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
    const linesSnapshot = linkedLinesMode
      ? purchaseLinesRef.current.map((line) => ({ ...line }))
      : undefined;
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
      itemId: linkedLinesMode ? "" : (form.itemId ?? ""),
      inventory,
      quantity: linkedLinesMode ? undefined : form.quantity,
      unitCost: linkedLinesMode ? undefined : cost,
      restock: linkedLinesMode ? restock : false,
      lines: linesSnapshot
        ? linesSnapshot.map(({ key, kind, itemId, manualName, quantity, unitCost }) => ({
            key,
            kind,
            itemId,
            manualName,
            quantity,
            unitCost,
          }))
        : undefined,
      quickPurchase,
    });
    if (
      inventoryError &&
      (linesSnapshot ? linesSnapshot.some((line) => line.kind === "linked") : form.itemId)
    )
      errors.itemId =
        "No se pudo confirmar el artículo de inventario. Actualiza la lista antes de continuar.";
    setPurchaseValidationErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalidLineField(errors.lineErrors, linesSnapshot ?? []);
      const firstSummary = Object.entries(errors).find(
        ([key, message]) => key !== "lineErrors" && typeof message === "string",
      )?.[1];
      toast.error(
        typeof firstSummary === "string" ? firstSummary : "Revisa los datos de la compra.",
      );
      return;
    }
    submitLock.current = true;
    setPending(true);
    const idempotencyKey = requestKey.current ?? globalThis.crypto.randomUUID();
    requestKey.current = idempotencyKey;
    const invNo = invoiceNo.trim() || "COMP-" + idempotencyKey.slice(0, 8).toUpperCase();
    const request: Record<string, unknown> & { idempotency_key: string } = {
      idempotency_key: idempotencyKey,
      supplier_id: quickPurchase ? null : (selectedSup?.id ?? null),
      supplier_name: supplierName,
      description: form.description.trim(),
      restock: linkedLinesMode ? Boolean(restock) : false,
      payment_type: paymentType,
      invoice_no: invNo,
      due_date: paymentType === "credito" ? dueDate || null : null,
    };
    if (linkedLinesMode) {
      request.lines = (linesSnapshot ?? []).map((line) => ({
        item_id: line.kind === "linked" ? line.itemId || null : null,
        ...(line.kind === "manual" ? { name: line.manualName } : {}),
        quantity: Number(line.quantity),
        unit_cost: Number(line.unitCost).toFixed(2),
      }));
    } else {
      request.item_id = null;
      request.quantity = Number(form.quantity);
      request.unit_cost = cost.toFixed(2);
    }
    try {
      if (typeof window === "undefined")
        throw new Error("No se puede conservar la operación pendiente en este entorno.");
      persistPendingBusinessOperation(window.sessionStorage, user.authUserId, {
        type: "purchase",
        idempotencyKey,
        request,
        context: {
          form,
          linkedLinesMode,
          lines: linesSnapshot ?? [],
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
      setLinkedLinesMode(true);
      replacePurchaseLines([blankPurchaseLine(newPurchaseLineKey())]);
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
      setLinkedLinesMode(true);
      replacePurchaseLines([blankPurchaseLine(newPurchaseLineKey())]);
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

  const historyHasFilters = Boolean(
    historySearch || historyPeriod !== "all" || historyFrom || historyTo,
  );
  const purchasesPageCount = Math.max(1, Math.ceil(purchasesTotalCount / 25));

  const commitHistorySearch = useCallback((value: string) => {
    setHistorySearch(value);
    setHistoryPageNumber(1);
  }, []);

  const changeHistoryPeriod = useCallback((period: HistoryPeriod) => {
    setHistoryPeriod(period);
    setHistoryPageNumber(1);
    if (period !== "custom") {
      setHistoryFrom("");
      setHistoryTo("");
    }
  }, []);

  const clearHistoryFilters = useCallback(() => {
    setHistorySearch("");
    setHistoryPeriod("all");
    setHistoryFrom("");
    setHistoryTo("");
    setHistoryPageNumber(1);
  }, []);

  useEffect(() => {
    if (historyPageNumber > purchasesPageCount) setHistoryPageNumber(purchasesPageCount);
  }, [historyPageNumber, purchasesPageCount]);

  useEffect(() => {
    const purchaseId = detailTarget?.id;
    if (!purchaseId) {
      setDetailLines([]);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setDetailLines([]);
    setDetailError(null);
    setDetailLoading(true);
    void loadPurchaseHistoryLines(purchaseId, controller.signal)
      .then(setDetailLines)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetailError(
          error instanceof Error ? error.message : "No se pudo cargar el detalle de la compra.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [detailTarget?.id]);

  const globalPurchaseErrors = Object.entries(purchaseValidationErrors).flatMap(([key, message]) =>
    key !== "lineErrors" && typeof message === "string" ? [message] : [],
  );

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
            <DialogContent
              className="max-w-xl max-h-[90vh] overflow-y-auto"
              style={{ maxWidth: "calc(100vw - 2rem)" }}
            >
              <DialogHeader>
                <DialogTitle>Nueva compra</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {globalPurchaseErrors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>Revisa los datos de la compra</AlertTitle>
                    <AlertDescription>
                      {globalPurchaseErrors.map((message, index) => (
                        <p key={`${index}-${message}`}>{message}</p>
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
                      clearGeneralPurchaseErrors();
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
                      <SearchableEntitySelect
                        options={suppliers}
                        value={supplierId}
                        onValueChange={(v) => {
                          setSupplierId(v);
                          clearGeneralPurchaseErrors();
                          const s = suppliers.find((x) => x.id === v);
                          if (s) setForm({ ...form, supplier: s.name });
                        }}
                        getOptionValue={(supplier) => supplier.id}
                        getSearchFields={(supplier) => [
                          supplier.name,
                          supplier.rnc,
                          supplier.id,
                          supplier.status,
                        ]}
                        isOptionDisabled={(supplier) => supplier.status !== "activo"}
                        renderOption={(supplier) => (
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{supplier.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {supplier.rnc ? `RNC ${supplier.rnc} · ` : ""}
                              ID {supplier.id.slice(0, 8)} · {supplier.status}
                            </span>
                          </span>
                        )}
                        renderValue={(supplier) => supplier.name}
                        placeholder={
                          suppliers.length ? "Elige un proveedor" : "No hay proveedores disponibles"
                        }
                        searchPlaceholder="Buscar por nombre, RNC o ID…"
                        emptyMessage="No se encontraron proveedores."
                        aria-labelledby="purchase-supplier-registered-label"
                        aria-invalid={Boolean(purchaseValidationErrors.supplierId)}
                        aria-describedby={
                          purchaseValidationErrors.supplierId
                            ? "purchase-supplier-error"
                            : undefined
                        }
                        className={
                          purchaseValidationErrors.supplierId ? "border-destructive" : undefined
                        }
                      />
                      {purchaseValidationErrors.supplierId && (
                        <p
                          id="purchase-supplier-error"
                          role="alert"
                          className="text-xs text-destructive"
                        >
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
                          clearGeneralPurchaseErrors();
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
                        clearGeneralPurchaseErrors();
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
                        clearGeneralPurchaseErrors();
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
                        clearGeneralPurchaseErrors();
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

                <div className="space-y-2">
                  <p id="purchase-detail-mode-label" className="text-sm font-medium">
                    Detalle de productos
                  </p>
                  <RadioGroup
                    value={linkedLinesMode ? "lines" : "unlinked"}
                    onValueChange={(value) => {
                      const useLinkedLines = value === "lines";
                      setLinkedLinesMode(useLinkedLines);
                      setPurchaseValidationErrors({});
                      if (!useLinkedLines) {
                        setForm((current) => ({ ...current, itemId: "" }));
                        setRestock(false);
                      }
                    }}
                    aria-labelledby="purchase-detail-mode-label"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                  >
                    <Label
                      htmlFor="purchase-detail-mode-linked"
                      className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal cursor-pointer"
                    >
                      <RadioGroupItem id="purchase-detail-mode-linked" value="lines" />
                      Detalle por líneas
                    </Label>
                    <Label
                      htmlFor="purchase-detail-mode-unlinked"
                      className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal cursor-pointer"
                    >
                      <RadioGroupItem id="purchase-detail-mode-unlinked" value="unlinked" />
                      Compra sin productos detallados
                    </Label>
                  </RadioGroup>
                </div>

                <Field label="Descripción de la compra" htmlFor="purchase-description">
                  <Input
                    id="purchase-description"
                    aria-invalid={Boolean(purchaseValidationErrors.description)}
                    aria-describedby="purchase-description-help purchase-description-error"
                    value={form.description}
                    onChange={(e) => {
                      setForm({ ...form, description: e.target.value });
                      clearGeneralPurchaseErrors();
                    }}
                    placeholder="Pomadas mate 150ml, Tijeras profesionales 7.5'..."
                  />
                </Field>
                <p id="purchase-description-help" className="-mt-2 text-xs text-muted-foreground">
                  Describe la factura o el propósito de la compra. Los productos y sus cantidades se
                  guardan por separado.
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

                {linkedLinesMode ? (
                  <section className="space-y-3" aria-label="Líneas de productos de la compra">
                    <div className="space-y-3">
                      {purchaseLines.map((line, index) => (
                        <div
                          key={line.key}
                          className="space-y-3 rounded-lg border border-border bg-muted/20 p-3"
                          data-testid={`purchase-line-${index + 1}`}
                        >
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(130px,0.7fr)_minmax(180px,1.3fr)_110px_140px_auto] sm:items-end">
                            <Field
                              label="Tipo de línea"
                              labelId={`purchase-line-kind-label-${index}`}
                            >
                              <Select
                                value={line.kind}
                                onValueChange={(value) => {
                                  const kind = value === "manual" ? "manual" : "linked";
                                  updatePurchaseLines((current) =>
                                    current.map((entry) =>
                                      entry.key === line.key
                                        ? { ...entry, kind, itemId: "", manualName: "" }
                                        : entry,
                                    ),
                                  );
                                }}
                              >
                                <SelectTrigger
                                  aria-labelledby={`purchase-line-kind-label-${index}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="linked">Producto vinculado</SelectItem>
                                  <SelectItem value="manual">No registrado</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            {line.kind === "linked" ? (
                              <Field
                                label={`Producto ${index + 1}`}
                                labelId={`purchase-line-product-label-${index}`}
                              >
                                <SearchableEntitySelect
                                  options={inventory}
                                  value={line.itemId}
                                  onValueChange={(value) => {
                                    updatePurchaseLines((current) =>
                                      current.map((entry) =>
                                        entry.key === line.key
                                          ? { ...entry, itemId: value }
                                          : entry,
                                      ),
                                    );
                                  }}
                                  getOptionValue={(item) => item.id}
                                  getSearchFields={(item) => [item.name, item.sku, item.id]}
                                  isOptionDisabled={(item) =>
                                    purchaseLines.some(
                                      (other) =>
                                        other.key !== line.key &&
                                        other.kind === "linked" &&
                                        other.itemId === item.id,
                                    )
                                  }
                                  renderOption={(item) => (
                                    <span className="flex min-w-0 flex-col">
                                      <span className="truncate font-medium">{item.name}</span>
                                      <span className="truncate text-xs text-muted-foreground">
                                        {item.sku} · Stock {item.quantity} · ID{" "}
                                        {item.id.slice(0, 8)}
                                      </span>
                                    </span>
                                  )}
                                  renderValue={(item) => `${item.sku} — ${item.name}`}
                                  placeholder="Elige un producto"
                                  searchPlaceholder="Buscar por nombre, SKU o código…"
                                  emptyMessage="No se encontraron productos."
                                  triggerRef={(element) =>
                                    setLineFieldRef(line.key, "itemId", element)
                                  }
                                  aria-labelledby={`purchase-line-product-label-${index}`}
                                  aria-invalid={Boolean(
                                    purchaseValidationErrors.lineErrors?.[line.key]?.itemId,
                                  )}
                                  aria-describedby={
                                    purchaseValidationErrors.lineErrors?.[line.key]?.itemId
                                      ? `purchase-line-error-${line.key}-itemId`
                                      : undefined
                                  }
                                  className={
                                    purchaseValidationErrors.lineErrors?.[line.key]?.itemId
                                      ? "border-destructive focus-visible:ring-destructive"
                                      : undefined
                                  }
                                />
                                {purchaseValidationErrors.lineErrors?.[line.key]?.itemId && (
                                  <p
                                    id={`purchase-line-error-${line.key}-itemId`}
                                    role="alert"
                                    className="text-xs text-destructive"
                                  >
                                    {purchaseValidationErrors.lineErrors[line.key].itemId}
                                  </p>
                                )}
                              </Field>
                            ) : (
                              <Field
                                label={`Nombre o descripción ${index + 1}`}
                                htmlFor={`purchase-line-name-${index}`}
                              >
                                <>
                                  <Input
                                    ref={(element) =>
                                      setLineFieldRef(line.key, "manualName", element)
                                    }
                                    id={`purchase-line-name-${index}`}
                                    data-testid={`purchase-line-name-${index + 1}`}
                                    maxLength={500}
                                    value={line.manualName}
                                    placeholder="Producto o servicio no registrado"
                                    className={
                                      purchaseValidationErrors.lineErrors?.[line.key]?.manualName
                                        ? "border-destructive focus-visible:ring-destructive"
                                        : undefined
                                    }
                                    aria-invalid={Boolean(
                                      purchaseValidationErrors.lineErrors?.[line.key]?.manualName,
                                    )}
                                    aria-describedby={
                                      purchaseValidationErrors.lineErrors?.[line.key]?.manualName
                                        ? `purchase-line-error-${line.key}-manualName`
                                        : undefined
                                    }
                                    onChange={(event) => {
                                      const manualName = event.target.value;
                                      updatePurchaseLines((current) =>
                                        current.map((entry) =>
                                          entry.key === line.key ? { ...entry, manualName } : entry,
                                        ),
                                      );
                                    }}
                                  />
                                  {purchaseValidationErrors.lineErrors?.[line.key]?.manualName && (
                                    <p
                                      id={`purchase-line-error-${line.key}-manualName`}
                                      data-testid={`purchase-line-error-${index + 1}-manualName`}
                                      role="alert"
                                      className="text-xs text-destructive"
                                    >
                                      {purchaseValidationErrors.lineErrors[line.key].manualName}
                                    </p>
                                  )}
                                </>
                              </Field>
                            )}
                            <Field label="Cantidad" htmlFor={`purchase-line-quantity-${index}`}>
                              <Input
                                ref={(element) => setLineFieldRef(line.key, "quantity", element)}
                                id={`purchase-line-quantity-${index}`}
                                data-testid={`purchase-line-quantity-${index + 1}`}
                                type="number"
                                min={1}
                                step={1}
                                value={line.quantity || ""}
                                className={
                                  purchaseValidationErrors.lineErrors?.[line.key]?.quantity
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : undefined
                                }
                                aria-invalid={Boolean(
                                  purchaseValidationErrors.lineErrors?.[line.key]?.quantity,
                                )}
                                aria-describedby={
                                  purchaseValidationErrors.lineErrors?.[line.key]?.quantity
                                    ? `purchase-line-error-${line.key}-quantity`
                                    : undefined
                                }
                                onChange={(event) => {
                                  const quantity =
                                    event.target.value === "" ? 0 : Number(event.target.value);
                                  updatePurchaseLines((current) =>
                                    current.map((entry) =>
                                      entry.key === line.key ? { ...entry, quantity } : entry,
                                    ),
                                  );
                                }}
                              />
                              {purchaseValidationErrors.lineErrors?.[line.key]?.quantity && (
                                <p
                                  id={`purchase-line-error-${line.key}-quantity`}
                                  data-testid={`purchase-line-error-${index + 1}-quantity`}
                                  role="alert"
                                  className="text-xs text-destructive"
                                >
                                  {purchaseValidationErrors.lineErrors[line.key].quantity}
                                </p>
                              )}
                            </Field>
                            <Field label="Costo unitario" htmlFor={`purchase-line-cost-${index}`}>
                              <Input
                                ref={(element) => setLineFieldRef(line.key, "unitCost", element)}
                                id={`purchase-line-cost-${index}`}
                                data-testid={`purchase-line-cost-${index + 1}`}
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.unitCost}
                                className={
                                  purchaseValidationErrors.lineErrors?.[line.key]?.unitCost
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : undefined
                                }
                                aria-invalid={Boolean(
                                  purchaseValidationErrors.lineErrors?.[line.key]?.unitCost,
                                )}
                                aria-describedby={
                                  purchaseValidationErrors.lineErrors?.[line.key]?.unitCost
                                    ? `purchase-line-error-${line.key}-unitCost`
                                    : undefined
                                }
                                onChange={(event) => {
                                  const unitCost =
                                    event.target.value === "" ? 0 : Number(event.target.value);
                                  updatePurchaseLines((current) =>
                                    current.map((entry) =>
                                      entry.key === line.key ? { ...entry, unitCost } : entry,
                                    ),
                                  );
                                }}
                              />
                              {purchaseValidationErrors.lineErrors?.[line.key]?.unitCost && (
                                <p
                                  id={`purchase-line-error-${line.key}-unitCost`}
                                  data-testid={`purchase-line-error-${index + 1}-unitCost`}
                                  role="alert"
                                  className="text-xs text-destructive"
                                >
                                  {purchaseValidationErrors.lineErrors[line.key].unitCost}
                                </p>
                              )}
                            </Field>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Quitar línea ${index + 1}`}
                              onClick={() => {
                                updatePurchaseLines((current) =>
                                  current.filter((entry) => entry.key !== line.key),
                                );
                              }}
                              disabled={pending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-right text-xs text-muted-foreground">
                            Subtotal:{" "}
                            {fmtMoney(calculatePurchaseTotalCents([line]) / 100, settings.currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        updatePurchaseLines((current) =>
                          current.length >= 100
                            ? current
                            : [...current, blankPurchaseLine(newPurchaseLineKey())],
                        );
                      }}
                      disabled={purchaseLines.length >= 100 || pending}
                      data-testid="purchase-add-line"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Agregar línea
                    </Button>
                    {purchaseLines.some((line) => line.kind === "linked" && line.itemId) && (
                      <label className="flex items-start gap-2 pt-1 text-sm font-medium text-foreground">
                        <input
                          className="mt-0.5"
                          type="checkbox"
                          checked={restock}
                          onChange={(event) => setRestock(event.target.checked)}
                        />
                        <span className="flex flex-col gap-1">
                          <span>Actualizar inventario de los productos vinculados</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            Al confirmar la compra, aumentarán las existencias de los productos
                            seleccionados del inventario. Los productos no registrados no se crearán
                            automáticamente.
                          </span>
                        </span>
                      </label>
                    )}
                  </section>
                ) : (
                  <div className="space-y-3">
                    {purchaseValidationErrors.description && !form.description.trim() && (
                      <p role="alert" className="text-xs text-destructive">
                        {purchaseValidationErrors.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Esta compra conserva el contrato simple y no modifica existencias.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Cantidad" htmlFor="purchase-quantity">
                        <Input
                          id="purchase-quantity"
                          type="number"
                          min={1}
                          step={1}
                          value={form.quantity || ""}
                          onChange={(event) => {
                            setForm({
                              ...form,
                              quantity: event.target.value === "" ? 0 : Number(event.target.value),
                            });
                            clearGeneralPurchaseErrors();
                          }}
                        />
                      </Field>
                      <Field label="Costo unitario" htmlFor="purchase-unit-cost">
                        <Input
                          id="purchase-unit-cost"
                          type="number"
                          min={0}
                          step="0.01"
                          value={form.unitCost}
                          onChange={(event) => {
                            setForm({
                              ...form,
                              unitCost: event.target.value === "" ? 0 : Number(event.target.value),
                            });
                            clearGeneralPurchaseErrors();
                          }}
                        />
                      </Field>
                    </div>
                  </div>
                )}
                <div className="text-right text-sm">
                  Total estimado:{" "}
                  <span className="font-mono font-semibold">
                    {fmtMoney(
                      linkedLinesMode
                        ? calculatePurchaseTotalCents(purchaseLines) / 100
                        : form.quantity * form.unitCost,
                      settings.currency,
                    )}
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
                    setLinkedLinesMode(true);
                    replacePurchaseLines([blankPurchaseLine(newPurchaseLineKey())]);
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

      <HistoryFilterBar
        kind="purchases"
        search={historySearch}
        onSearch={commitHistorySearch}
        period={historyPeriod}
        onPeriodChange={changeHistoryPeriod}
        from={historyFrom}
        onFromChange={(value) => {
          setHistoryFrom(value);
          setHistoryPageNumber(1);
        }}
        to={historyTo}
        onToChange={(value) => {
          setHistoryTo(value);
          setHistoryPageNumber(1);
        }}
        dateError={purchasesDateError}
        onClear={clearHistoryFilters}
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
            ) : purchasesDateError ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Corrige el rango en los filtros para consultar las compras.
                </td>
              </tr>
            ) : purchases.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  {historyHasFilters
                    ? "No hay compras que coincidan con los filtros."
                    : "Aún no hay compras."}
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
                    {p.lineCount ? (
                      <div className="text-xs text-muted-foreground">
                        {p.lineCount} producto{p.lineCount === 1 ? "" : "s"}
                        {p.lineSummary?.length ? (
                          <span>
                            {" "}
                            ·{" "}
                            {p.lineSummary
                              .map(
                                (line) =>
                                  `${line.itemId === null ? "No registrado" : "Vinculado"}: ${line.name} × ${line.quantity}`,
                              )
                              .join(", ")}
                          </span>
                        ) : null}
                      </div>
                    ) : p.itemId ? (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Artículo legado vinculado · {p.itemId.slice(0, 8)}
                      </div>
                    ) : null}
                    {p.invoiceNo && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Factura {p.invoiceNo}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 py-1"
                      onClick={() => setDetailTarget(p)}
                      aria-label={`Ver detalles de compra ${p.invoiceNo || p.id}`}
                    >
                      Ver detalles
                    </Button>
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
      <HistoryPagination
        kind="purchases"
        page={historyPageNumber}
        totalCount={purchasesTotalCount}
        onPageChange={setHistoryPageNumber}
      />
      <Dialog
        open={Boolean(detailTarget)}
        onOpenChange={(value) => {
          if (!value && !detailLoading) setDetailTarget(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalle de compra {detailTarget?.invoiceNo || detailTarget?.id}
            </DialogTitle>
            <DialogDescription>
              {detailTarget?.supplier} · {detailTarget ? fmtDate(detailTarget.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                <p>Factura: {detailTarget.invoiceNo || "Sin número"}</p>
                <p>Pago: {detailTarget.paymentType === "credito" ? "Crédito" : "Contado"}</p>
                <p className="sm:col-span-2">
                  Descripción: {detailTarget.description || "Sin descripción"}
                </p>
                <p className="font-semibold">
                  Total: {fmtMoney(detailTarget.total, settings.currency)}
                </p>
              </div>
              {detailLoading ? (
                <p role="status" className="py-6 text-center text-sm text-muted-foreground">
                  Cargando detalle…
                </p>
              ) : detailError ? (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo cargar el detalle</AlertTitle>
                  <AlertDescription>{detailError}</AlertDescription>
                </Alert>
              ) : detailLines.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2 text-right">Costo unitario</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailLines.map((line) => (
                        <tr key={line.lineNumber} className="border-t border-border">
                          <td className="px-3 py-2">
                            <span className="block font-medium">{line.nameSnapshot}</span>
                            {line.itemId ? (
                              <span className="font-mono text-xs text-muted-foreground">
                                Producto vinculado{line.skuSnapshot ? ` · ${line.skuSnapshot}` : ""}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Producto no registrado
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{line.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmtMoney(line.unitCost, settings.currency)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmtMoney(line.subtotal, settings.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : detailTarget.itemId ? (
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium">Compra histórica de una sola línea</p>
                  <p className="text-muted-foreground">
                    Artículo vinculado {detailTarget.itemId} · {detailTarget.quantity} unidades ×{" "}
                    {fmtMoney(detailTarget.unitCost, settings.currency)}.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    El documento original no guardó un snapshot de nombre de producto.
                  </p>
                </div>
              ) : (
                <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                  Compra histórica sin producto vinculado. Se conserva su descripción original.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailTarget(null)}
              disabled={detailLoading}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

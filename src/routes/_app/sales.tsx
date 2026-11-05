import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabaseTable, useSupabaseView, fmtMoney, fmtDate } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { Sale, SaleLine } from "@/lib/types";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Ban, Receipt as ReceiptIcon, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { PersistenceError, userPersistenceMessage } from "@/lib/persistence.js";
import {
  getConfirmedBusinessOperation,
  postBusinessOperation,
  runFinancialCorrection,
} from "@/lib/businessOperations";
import { useAuth } from "@/lib/auth";
import { clampSaleQuantity } from "@/lib/catalog.js";
import { supabase } from "@/lib/supabase";
import { deriveSalesPolicyState } from "@/lib/salesPolicy.js";
import { validateSaleDraft } from "@/lib/businessDocumentValidation.js";
import {
  clearPendingBusinessOperation,
  persistPendingBusinessOperation,
  readPendingBusinessOperation,
} from "@/lib/pendingBusinessOperation.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

function SalesPage() {
  const {
    data: sales,
    refresh: refreshSales,
    loading: salesLoading,
    loadError: salesError,
  } = useSupabaseTable<Sale>("sales");
  const {
    data: clients,
    refresh: refreshClients,
    loading: clientsLoading,
    loadError: clientsError,
  } = useSupabaseView("sales_client_lookup");
  const {
    data: inventory,
    refresh: refreshInventory,
    loading: inventoryLoading,
    loadError: inventoryError,
  } = useSupabaseView("sales_inventory_lookup");
  const requestKey = useRef<string | null>(null);
  const submitLock = useRef(false);
  const annulLock = useRef(false);
  const [settings] = useSettings();
  const { user } = useAuth();
  const [taxPolicyState, setTaxPolicyState] = useState<
    "loading" | "unknown" | "blocked" | "unsupported" | "approved"
  >("loading");
  const [taxPolicyError, setTaxPolicyError] = useState<string | null>(null);
  const policyRequest = useRef(0);
  const [pendingOperationType, setPendingOperationType] = useState<string | null>(null);
  const [pendingOperationError, setPendingOperationError] = useState<string | null>(null);
  const annulKeys = useRef(new Map<string, string>());

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [pickItem, setPickItem] = useState("");
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [dueDate, setDueDate] = useState<string>("");
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [annulTarget, setAnnulTarget] = useState<Sale | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [annulPending, setAnnulPending] = useState(false);
  const [annulUncertain, setAnnulUncertain] = useState(false);
  const [pending, setPending] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [saleValidationErrors, setSaleValidationErrors] = useState<Record<string, string>>({});

  const refreshTaxPolicy = useCallback(async () => {
    const request = ++policyRequest.current;
    setTaxPolicyState("loading");
    setTaxPolicyError(null);
    if (!user?.authUserId) {
      setTaxPolicyState("unknown");
      return "unknown" as const;
    }
    try {
      const { data, error } = await supabase
        .from("sales_posting_status")
        .select("tax_policy_approved,sales_posting_supported")
        .maybeSingle();
      const state = deriveSalesPolicyState({ data, error });
      if (request === policyRequest.current) {
        setTaxPolicyState(state);
        if (state === "unknown")
          setTaxPolicyError(
            error
              ? "No se pudo consultar la política tributaria con tus permisos actuales."
              : "No tienes acceso a la política tributaria; solicita a un administrador que confirme su estado.",
          );
      }
      return state;
    } catch {
      if (request === policyRequest.current) {
        setTaxPolicyState("unknown");
        setTaxPolicyError(
          "No se pudo confirmar la política tributaria. Las ventas permanecerán bloqueadas.",
        );
      }
      return "unknown" as const;
    }
  }, [user?.authUserId]);

  useEffect(() => {
    if (!user?.authUserId) return;
    void refreshTaxPolicy();
    const onFocus = () => void refreshTaxPolicy();
    window.addEventListener("focus", onFocus);
    return () => {
      policyRequest.current += 1;
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshTaxPolicy, user?.authUserId]);

  useEffect(() => {
    if (!user?.authUserId || typeof window === "undefined") return;
    try {
      const operation = readPendingBusinessOperation(window.sessionStorage, user.authUserId);
      if (!operation) return;
      setPendingOperationType(operation.type);
      if (operation.type === "financial_annulment" && operation.request.document_type === "sale") {
        const context = operation.context as { document?: Sale; reason?: string } | undefined;
        annulKeys.current.set(String(operation.request.document_id), operation.idempotencyKey);
        if (context?.document) setAnnulTarget(context.document);
        if (context?.reason) setAnnulReason(context.reason);
        setAnnulUncertain(true);
        return;
      }
      if (operation.type !== "sale") return;
      requestKey.current = operation.idempotencyKey;
      setNeedsReconciliation(true);
      setOpen(true);
      if (operation.context && typeof operation.context === "object") {
        const context = operation.context as {
          clientId?: string;
          lines?: SaleLine[];
          paymentType?: "contado" | "credito";
          dueDate?: string;
        };
        if (context.clientId) setClientId(context.clientId);
        if (Array.isArray(context.lines)) setLines(context.lines);
        if (context.paymentType) setPaymentType(context.paymentType);
        if (context.dueDate) setDueDate(context.dueDate);
      }
    } catch (error) {
      setPendingOperationType("unreadable");
      setNeedsReconciliation(true);
      setTaxPolicyError(
        error instanceof Error
          ? error.message
          : "Existe una operación financiera pendiente que requiere revisión.",
      );
    }
  }, [user?.authUserId]);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const tax = +(subtotal * (settings.taxRate / 100)).toFixed(2);
  const total = subtotal + tax;

  const addLine = () => {
    const item = inventory.find((i) => i.id === pickItem);
    if (!item) return;
    if (item.quantity < 1) {
      toast.error("Este artículo activo no tiene existencia disponible.");
      return;
    }
    const existing = lines.find((l) => l.itemId === item.id);
    if (existing) {
      if (existing.quantity >= item.quantity) {
        toast.error("La cantidad supera la existencia disponible");
        return;
      }
      setLines(lines.map((l) => (l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      setLines([
        ...lines,
        { itemId: item.id, sku: item.sku, name: item.name, unitPrice: item.price, quantity: 1 },
      ]);
    }
    setPickItem("");
    setSaleValidationErrors({});
  };

  const removeLine = (id: string) => {
    setLines(lines.filter((l) => l.itemId !== id));
    setSaleValidationErrors({});
  };
  const setQty = (id: string, requested: number) => {
    const product = inventory.find((item) => item.id === id);
    const available = product?.quantity ?? 0;
    if (!Number.isSafeInteger(requested) || requested < 1) {
      toast.error("La cantidad debe ser un número entero mayor que cero.");
      return;
    }
    if (requested > available) {
      toast.error(
        `La cantidad no puede superar ${available} unidad${available === 1 ? "" : "es"} disponible${available === 1 ? "" : "s"}.`,
      );
      return;
    }
    setLines(
      lines.map((line) =>
        line.itemId === id ? { ...line, quantity: clampSaleQuantity(requested, available) } : line,
      ),
    );
    setSaleValidationErrors({});
  };

  const reset = () => {
    setClientId("");
    setLines([]);
    setPickItem("");
    setPaymentType("contado");
    setDueDate("");
    setSaleValidationErrors({});
  };

  const save = async () => {
    if (submitLock.current || pending || needsReconciliation || pendingOperationType) return;
    const errors = validateSaleDraft({ clientId, clients, lines, inventory, paymentType, dueDate });
    setSaleValidationErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    if (!user?.authUserId) {
      toast.error("La sesión no está confirmada. Inicia sesión antes de registrar la venta.");
      return;
    }
    submitLock.current = true;
    setPending(true);
    let idempotencyKey: string | null = null;
    try {
      if ((await refreshTaxPolicy()) !== "approved") {
        toast.error(
          "La política tributaria no está aprobada o no se puede confirmar. No se registró la venta.",
        );
        return;
      }
      idempotencyKey = requestKey.current ?? globalThis.crypto.randomUUID();
      requestKey.current = idempotencyKey;
      const request = {
        idempotency_key: idempotencyKey,
        client_id: clientId,
        payment_type: paymentType,
        due_date: paymentType === "credito" ? dueDate || null : null,
        lines: lines.map((line) => ({
          item_id: line.itemId,
          quantity: line.quantity,
          expected_unit_price: line.unitPrice.toFixed(2),
        })),
      };
      if (typeof window === "undefined")
        throw new Error("No se puede conservar la operación pendiente en este entorno.");
      persistPendingBusinessOperation(window.sessionStorage, user.authUserId, {
        type: "sale",
        idempotencyKey,
        request,
        context: { clientId, paymentType, dueDate, lines },
      });
      setPendingOperationType("sale");
      const result = await postBusinessOperation("sale", request);
      clearPendingBusinessOperation(window.sessionStorage, user.authUserId, idempotencyKey);
      requestKey.current = null;
      setPendingOperationType(null);
      const savedLines = Array.isArray(result.lines)
        ? (result.lines as Array<Record<string, unknown>>)
        : [];
      const sale: Sale = {
        id: String(result.sale_id),
        receiptNo: String(result.receipt_no),
        clientId: String(result.client_id ?? clientId),
        lines: savedLines.map((line) => ({
          itemId: String(line.item_id),
          sku: String(line.sku),
          name: String(line.name),
          unitPrice: Number(line.unit_price),
          quantity: Number(line.quantity),
        })),
        subtotal: Number(result.subtotal),
        taxRate: Number(result.tax_rate ?? 0),
        tax: Number(result.tax),
        total: Number(result.total),
        paymentType: result.payment_type === "credito" ? "credito" : "contado",
        dueDate: typeof result.due_date === "string" ? result.due_date : undefined,
        createdAt:
          typeof result.created_at === "string" ? result.created_at : new Date().toISOString(),
      };
      void refreshSales();
      void refreshInventory();
      toast.success(
        paymentType === "credito" ? "Venta y cuenta por cobrar confirmadas" : "Venta confirmada",
      );
      setOpen(false);
      reset();
      setViewing(sale);
    } catch (e) {
      const uncertain = e instanceof PersistenceError && e.kind === "uncertain";
      if (uncertain) {
        setNeedsReconciliation(true);
        setPendingOperationType("sale");
      } else {
        if (idempotencyKey && typeof window !== "undefined" && user?.authUserId)
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

  const reconcileSale = async () => {
    const key = requestKey.current;
    if (!key || pending || !user?.authUserId || pendingOperationType !== "sale") return;
    setPending(true);
    try {
      const result = await getConfirmedBusinessOperation("sale", key);
      if (!result) {
        toast.error(
          "La operación todavía no aparece confirmada. Conserva este formulario y vuelve a consultar.",
        );
        return;
      }
      const savedLines = Array.isArray(result.lines)
        ? (result.lines as Array<Record<string, unknown>>)
        : [];
      const sale: Sale = {
        id: String(result.sale_id),
        receiptNo: String(result.receipt_no),
        clientId: String(result.client_id),
        lines: savedLines.map((line) => ({
          itemId: String(line.item_id),
          sku: String(line.sku),
          name: String(line.name),
          unitPrice: Number(line.unit_price),
          quantity: Number(line.quantity),
        })),
        subtotal: Number(result.subtotal),
        taxRate: Number(result.tax_rate),
        tax: Number(result.tax),
        total: Number(result.total),
        paymentType: result.payment_type === "credito" ? "credito" : "contado",
        dueDate: typeof result.due_date === "string" ? result.due_date : undefined,
        createdAt:
          typeof result.created_at === "string" ? result.created_at : new Date().toISOString(),
      };
      clearPendingBusinessOperation(window.sessionStorage, user.authUserId, key);
      requestKey.current = null;
      setNeedsReconciliation(false);
      setPendingOperationType(null);
      void refreshSales();
      void refreshInventory();
      toast.success("Venta confirmada y reconciliada");
      setOpen(false);
      reset();
      setViewing(sale);
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
      document_type: "sale",
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
        context: { documentType: "sale", documentId: document.id, reason, document },
      });
      setPendingOperationType("financial_annulment");
      await runFinancialCorrection("financial_annulment", request);
      clearPendingBusinessOperation(window.sessionStorage, user.authUserId, key);
      annulKeys.current.delete(document.id);
      setPendingOperationType(null);
      setAnnulTarget(null);
      setAnnulReason("");
      setAnnulUncertain(false);
      void refreshSales();
      void refreshInventory();
      toast.success("Venta anulada con compensación persistida.");
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
      void refreshSales();
      void refreshInventory();
      toast.success("Anulación confirmada y reconciliada.");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setAnnulPending(false);
    }
  };

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  return (
    <div>
      {taxPolicyState !== "approved" && (
        <Alert
          variant={
            taxPolicyState === "blocked" || taxPolicyState === "unsupported"
              ? "destructive"
              : "default"
          }
          className="mb-4"
        >
          <AlertTitle>
            {taxPolicyState === "loading"
              ? "Comprobando política tributaria"
              : taxPolicyState === "blocked"
                ? "Ventas bloqueadas"
                : taxPolicyState === "unsupported"
                  ? "Configuración tributaria no disponible para ventas"
                  : "No se puede confirmar la política tributaria"}
          </AlertTitle>
          <AlertDescription>
            {taxPolicyState === "loading"
              ? "Se verificará el estado vigente antes de habilitar la creación de ventas."
              : taxPolicyState === "blocked"
                ? "La política tributaria y sus parámetros requieren aprobación. No se pueden contabilizar ventas hasta que un administrador confirme la aprobación."
                : taxPolicyState === "unsupported"
                  ? "La configuración vigente requiere un cálculo tributario que todavía no forma parte del flujo autorizado. No se contabilizan ventas."
                  : taxPolicyError ||
                    "Solicita a un administrador que revise los permisos y confirme el estado vigente."}
            {taxPolicyState === "unknown" && (
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => void refreshTaxPolicy()}
              >
                Reintentar
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {pendingOperationType && pendingOperationType !== "sale" && (
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
        title="Ventas"
        description="Emite recibos, controla ingresos y registra ventas a contado o crédito."
        actions={
          <Dialog
            open={open}
            onOpenChange={(o) => {
              if (!o && (needsReconciliation || pending || pendingOperationType === "sale")) return;
              if (o && taxPolicyState !== "approved") return;
              setOpen(o);
            }}
          >
            <DialogTrigger asChild>
              <Button
                disabled={taxPolicyState !== "approved" || Boolean(pendingOperationType)}
                className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
              >
                <Plus className="h-4 w-4 mr-1.5" />{" "}
                {taxPolicyState === "approved" ? "Nueva venta" : "Ventas no disponibles"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva venta</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {Object.keys(saleValidationErrors).length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>Revisa los datos de la venta</AlertTitle>
                    <AlertDescription>
                      {Object.values(saleValidationErrors).map((message) => (
                        <p key={message}>{message}</p>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}
                {(clientsError || inventoryError) && (
                  <Alert variant="destructive">
                    <AlertTitle>No se pudo cargar la información necesaria</AlertTitle>
                    <AlertDescription>
                      {clientsError || inventoryError}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void refreshClients()}>
                          Reintentar clientes
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void refreshInventory()}>
                          Reintentar artículos
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                {clientsLoading && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Cargando clientes autorizados…
                  </p>
                )}
                {inventoryLoading && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Cargando artículos activos y existencias…
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sale-client">Cliente activo</Label>
                    <Select
                      value={clientId}
                      onValueChange={(value) => {
                        setClientId(value);
                        setSaleValidationErrors({});
                      }}
                    >
                      <SelectTrigger id="sale-client">
                        <SelectValue
                          placeholder={
                            clients.length ? "Elige un cliente" : "No hay clientes disponibles"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {clients
                          .filter((c) => c.status === "activo")
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} · ID {c.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      El identificador UUID evita confundir clientes con nombres iguales.
                    </p>
                    {saleValidationErrors.clientId && (
                      <p role="alert" className="text-xs text-destructive">
                        {saleValidationErrors.clientId}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Método de Pago</Label>
                    <Select
                      value={paymentType}
                      onValueChange={(v) => {
                        setPaymentType(v as "contado" | "credito");
                        setSaleValidationErrors({});
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado (Inmediato)</SelectItem>
                        <SelectItem value="credito">Crédito (Genera Deuda)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Contado se paga inmediatamente. Crédito crea una cuenta por cobrar para el
                      cliente.
                    </p>
                  </div>
                </div>

                {paymentType === "credito" && (
                  <div className="p-3 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/5 space-y-2">
                    <div className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                      Venta a Crédito — Cuenta por Cobrar
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sale-due-date" className="text-xs">
                        Fecha de vencimiento (opcional)
                      </Label>
                      <Input
                        id="sale-due-date"
                        type="date"
                        aria-invalid={Boolean(saleValidationErrors.dueDate)}
                        aria-describedby="sale-due-date-error"
                        value={dueDate}
                        onChange={(e) => {
                          setDueDate(e.target.value);
                          setSaleValidationErrors({});
                        }}
                        className="h-9"
                      />
                      {saleValidationErrors.dueDate && (
                        <p
                          id="sale-due-date-error"
                          role="alert"
                          className="text-xs text-destructive"
                        >
                          {saleValidationErrors.dueDate}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-border">
                  <div className="p-3 flex gap-2 border-b border-border bg-muted/30">
                    <Select value={pickItem} onValueChange={setPickItem}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecciona producto para agregar" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map((i) => (
                          <SelectItem key={i.id} value={i.id} disabled={Number(i.quantity) < 1}>
                            {i.sku} — {i.name} · ID {i.id.slice(0, 8)} ·{" "}
                            {Number(i.quantity) > 0
                              ? `${i.quantity} disponibles`
                              : "Sin existencia"}{" "}
                            · {fmtMoney(i.price, settings.currency)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={addLine}
                      disabled={!pickItem}
                      className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                    >
                      <Plus /> Agregar
                    </Button>
                  </div>
                  {lines.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {inventory.length === 0
                        ? "No hay artículos activos disponibles para vender."
                        : "Sin artículos agregados."}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-sm">
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
                              <td className="px-3 py-2">
                                <div className="font-medium">{l.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {l.sku}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {fmtMoney(l.unitPrice, settings.currency)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Input
                                  type="number"
                                  min={1}
                                  max={
                                    inventory.find((item) => item.id === l.itemId)?.quantity ?? 1
                                  }
                                  value={l.quantity}
                                  onChange={(e) => setQty(l.itemId, +e.target.value)}
                                  className="h-8 w-16 ml-auto text-right"
                                  aria-label={`Cantidad de ${l.name}`}
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {fmtMoney(l.unitPrice * l.quantity, settings.currency)}
                              </td>
                              <td className="px-3 py-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Quitar ${l.name}`}
                                  onClick={() => removeLine(l.itemId)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {saleValidationErrors.lines && (
                  <p role="alert" className="px-3 pb-3 text-xs text-destructive">
                    {saleValidationErrors.lines}
                  </p>
                )}
                <div className="ml-auto w-full sm:w-64 space-y-1 text-sm">
                  <Row label="Subtotal" value={fmtMoney(subtotal, settings.currency)} />
                  <Row
                    label={`Impuesto (${settings.taxRate}%)`}
                    value={fmtMoney(tax, settings.currency)}
                  />
                  <div className="h-px bg-border my-1" />
                  <Row label="Estimado" value={fmtMoney(total, settings.currency)} bold />
                  <p className="text-xs text-muted-foreground">
                    El servidor calculará y confirmará el importe antes de registrar la venta.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  disabled={pending || needsReconciliation}
                >
                  Cancelar
                </Button>
                <p role="status" className="mr-auto text-sm text-muted-foreground">
                  Venta, stock y crédito se confirman en una operación.
                </p>
                {needsReconciliation && (
                  <p role="alert" className="text-sm text-destructive">
                    No se recibió confirmación. No repitas la venta; consulta el resultado con la
                    misma clave.
                  </p>
                )}
                {needsReconciliation && (
                  <Button variant="outline" onClick={reconcileSale} disabled={pending}>
                    Consultar operación
                  </Button>
                )}
                <Button
                  onClick={save}
                  disabled={
                    pending ||
                    needsReconciliation ||
                    Boolean(pendingOperationType) ||
                    taxPolicyState !== "approved" ||
                    clientsLoading ||
                    inventoryLoading ||
                    Boolean(clientsError || inventoryError)
                  }
                  aria-busy={pending}
                  className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                >
                  {pending ? "Confirmando…" : "Confirmar venta"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {salesError && (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>No se pudieron cargar las ventas</AlertTitle>
          <AlertDescription>
            {salesError}
            <Button
              size="sm"
              variant="outline"
              className="ml-2"
              onClick={() => void refreshSales()}
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
              <th className="text-left px-4 py-3">Recibo #</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-right px-4 py-3">Piezas</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {salesLoading ? (
              <tr>
                <td colSpan={6} role="status" className="text-center py-12 text-muted-foreground">
                  Cargando ventas…
                </td>
              </tr>
            ) : salesError ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  No se muestran datos porque la lectura falló.
                </td>
              </tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Aún no hay ventas.
                </td>
              </tr>
            ) : (
              sales.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{s.receiptNo}</td>
                  <td className="px-4 py-3">{clientName(s.clientId)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(s.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.lines.reduce((a, b) => a + b.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtMoney(s.total, settings.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setViewing(s)}
                        aria-label={`Ver recibo ${s.receiptNo}`}
                      >
                        <ReceiptIcon className="h-4 w-4" />
                      </Button>
                      {s.voidedAt ? (
                        <span className="px-2 text-xs text-rose-400">
                          Anulada{s.voidReason ? `: ${s.voidReason}` : ""}
                        </span>
                      ) : (
                        user?.role === "admin" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setAnnulTarget(s);
                              setAnnulReason("");
                              setAnnulUncertain(false);
                            }}
                            aria-label={`Anular venta ${s.receiptNo}`}
                            disabled={Boolean(pendingOperationType)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ReceiptDialog sale={viewing} onClose={() => setViewing(null)} />
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
            <DialogTitle>Anular venta {annulTarget?.receiptNo}</DialogTitle>
            <DialogDescription>
              La anulación conserva el recibo original y registra una compensación de inventario y
              saldo cuando corresponde.
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
            <Label htmlFor="sale-annul-reason">Motivo obligatorio</Label>
            <Textarea
              id="sale-annul-reason"
              value={annulReason}
              maxLength={500}
              aria-invalid={annulReason.trim().length === 0 || annulReason.trim().length > 500}
              aria-describedby="sale-annul-help"
              onChange={(event) => setAnnulReason(event.target.value)}
              placeholder="Explica por qué se anula este documento"
              className="resize-none"
            />
            <p id="sale-annul-help" className="text-xs text-muted-foreground">
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

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={`flex justify-between ${bold ? "font-semibold text-base" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
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
        <DialogHeader className="no-print">
          <DialogTitle>Recibo {sale.receiptNo}</DialogTitle>
        </DialogHeader>
        <div id="receipt-print" className="bg-white text-black p-6 rounded-md font-sans">
          <div className="text-center border-b border-gray-300 pb-3">
            <div
              className="font-display text-2xl"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {settings.businessName}
            </div>
            <div className="text-xs text-gray-600 mt-1">{settings.businessAddress}</div>
            <div className="text-xs text-gray-600">{settings.businessPhone}</div>
            <div className="mt-2 text-[11px] font-semibold tracking-wide">
              RECIBO INTERNO — NO ES COMPROBANTE FISCAL
            </div>
          </div>
          {sale.voidedAt && (
            <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
              <strong>VENTA ANULADA</strong> · {fmtDate(sale.voidedAt)}
              {sale.voidReason ? ` · Motivo: ${sale.voidReason}` : ""}
            </div>
          )}
          <div className="flex justify-between text-xs mt-3">
            <div>
              <div className="text-gray-500 uppercase tracking-wider">Cliente</div>
              <div className="font-medium text-sm">{client?.name || "Mostrador"}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-500 uppercase tracking-wider">Recibo</div>
              <div className="font-mono text-sm">{sale.receiptNo}</div>
              <div>{new Date(sale.createdAt).toLocaleString()}</div>
              <div className="mt-1">{sale.paymentType === "credito" ? "Crédito" : "Contado"}</div>
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
                  <td className="py-2 text-right font-mono">
                    {fmtMoney(l.unitPrice, settings.currency)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {fmtMoney(l.unitPrice * l.quantity, settings.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto w-56 mt-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">{fmtMoney(sale.subtotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>
                {sale.taxCalculationEnabled === false
                  ? "ITBIS desactivado"
                  : `ITBIS (${sale.taxRate}%)`}
              </span>
              <span className="font-mono">{fmtMoney(sale.tax, settings.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold text-sm">
              <span>Total</span>
              <span className="font-mono">{fmtMoney(sale.total, settings.currency)}</span>
            </div>
          </div>
          <div className="text-center text-xs text-gray-500 mt-6 border-t border-gray-300 pt-3">
            Gracias por su compra en {settings.businessName}.
          </div>
        </div>
        <DialogFooter className="no-print">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer /> Imprimir recibo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

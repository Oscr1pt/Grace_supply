import { createFileRoute } from "@tanstack/react-router";
import { Children, cloneElement, isValidElement, useId, useState } from "react";
import { useSupabaseTable, uid, fmtMoney } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { InventoryItem } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Pencil,
  Barcode as BarcodeIcon,
  Printer,
  Search,
  Package,
  RefreshCw,
  Power,
} from "lucide-react";

import { BarcodeLabel, LabelSizeControls } from "@/components/BarcodeLabel";
import { toast } from "sonner";
import { userPersistenceMessage } from "@/lib/persistence.js";
import { useAuth } from "@/lib/auth";
import {
  getCatalogCategories,
  getCatalogSearchText,
  normalizeCatalogValue,
  parseCatalogAttributes,
  parseCatalogMoney,
  resolveCatalogCategory,
} from "@/lib/catalog.js";
import { persistenceFailure } from "@/lib/persistence.js";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

type InventoryForm = Omit<
  Pick<
    InventoryItem,
    | "sku"
    | "name"
    | "description"
    | "category"
    | "brand"
    | "presentation"
    | "unit"
    | "attributes"
    | "isActive"
    | "costPrice"
    | "price"
    | "quantity"
  >,
  "brand" | "presentation" | "unit"
> & { brand: string; presentation: string; unit: string };

const emptyForm: InventoryForm = {
  sku: "",
  name: "",
  description: "",
  category: "",
  brand: "",
  presentation: "",
  unit: "",
  attributes: {},
  isActive: true,
  costPrice: 0,
  price: 0,
  quantity: 0,
};

function genSku() {
  return "GS-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function InventoryPage() {
  const { isAdmin } = useAuth();
  const {
    data: items,
    loading,
    loadError,
    refresh,
    insert: insertItem,
    update: updateItem,
  } = useSupabaseTable<InventoryItem>("inventory");
  const [settings, setSettings, settingsReadStatus] = useSettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [attributesText, setAttributesText] = useState("{}");
  const [costPriceText, setCostPriceText] = useState("0");
  const [priceText, setPriceText] = useState("0");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"sku" | "name" | "category" | "costPrice" | "price" | "attributes", string>>
  >({});
  const [q, setQ] = useState("");
  const [barcodeItem, setBarcodeItem] = useState<InventoryItem | null>(null);
  const [savingLabelSettings, setSavingLabelSettings] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingRows, setPendingRows] = useState<Set<string>>(() => new Set());
  const categories = getCatalogCategories(items);

  const startNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, sku: genSku() });
    setAttributesText("{}");
    setCostPriceText("0");
    setPriceText("0");
    setFieldErrors({});
    setOpen(true);
  };

  const startEdit = (i: InventoryItem) => {
    setEditing(i);
    setForm({
      ...emptyForm,
      ...i,
      brand: i.brand ?? "",
      presentation: i.presentation ?? "",
      unit: i.unit ?? "",
      attributes: i.attributes ?? {},
    });
    setAttributesText(JSON.stringify(i.attributes ?? {}, null, 2));
    setCostPriceText(String(i.costPrice));
    setPriceText(String(i.price));
    setFieldErrors({});
    setOpen(true);
  };

  const setMoneyText = (field: "costPrice" | "price", value: string) => {
    if (field === "costPrice") setCostPriceText(value);
    else setPriceText(value);
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const save = async () => {
    if (pending) return;
    const nextErrors: typeof fieldErrors = {};
    if (!form.sku.trim()) nextErrors.sku = "Escribe un SKU para identificar el producto.";
    if (!form.name.trim()) nextErrors.name = "Escribe el nombre del producto.";
    if (!form.category.trim()) nextErrors.category = "Elige o escribe una categoría.";
    const parsedAttributes = parseCatalogAttributes(attributesText);
    if (parsedAttributes.error) nextErrors.attributes = parsedAttributes.error;
    const costPrice = isAdmin ? parseCatalogMoney(costPriceText) : form.costPrice;
    const price = isAdmin ? parseCatalogMoney(priceText) : form.price;
    if (isAdmin && costPrice === null)
      nextErrors.costPrice = "Usa un importe igual o mayor que cero, con hasta 2 decimales.";
    if (isAdmin && price === null)
      nextErrors.price = "Usa un importe igual o mayor que cero, con hasta 2 decimales.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Revisa los campos marcados antes de guardar.");
      return;
    }
    setForm((current) => ({ ...current, costPrice: costPrice as number, price: price as number }));
    if (!form.name.trim() || !form.sku.trim()) {
      toast.error("Nombre y SKU son obligatorios");
      return;
    }
    let attributes: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(attributesText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("object_required");
      attributes = parsed as Record<string, unknown>;
    } catch {
      toast.error("Los atributos adicionales deben ser un objeto JSON válido");
      return;
    }
    if (!form.category.trim()) {
      toast.error("La categoría es obligatoria");
      return;
    }
    setPending(true);
    try {
      const catalogItem = {
        ...form,
        sku: form.sku.trim(),
        name: form.name.trim(),
        category: resolveCatalogCategory(form.category, categories),
        description: form.description.trim(),
        brand: form.brand.trim() || null,
        presentation: form.presentation.trim() || null,
        unit: form.unit.trim() || null,
        attributes: parsedAttributes.value as Record<string, unknown>,
        costPrice: costPrice as number,
        price: price as number,
      };
      if (editing) {
        const { quantity: _stock, ...metadataAndPrice } = catalogItem;
        await updateItem(editing.id, metadataAndPrice);
        toast.success("Producto actualizado");
      } else {
        await insertItem({ id: uid(), createdAt: new Date().toISOString(), ...catalogItem });
        toast.success("Producto agregado");
      }
      setOpen(false);
      setFieldErrors({});
    } catch (e) {
      if (persistenceFailure(e).kind === "conflict") {
        setFieldErrors((current) => ({ ...current, sku: "Este SKU ya existe. Usa otro código." }));
        toast.error("El SKU ya está registrado. Usa otro código.");
      } else {
        toast.error(userPersistenceMessage(e));
      }
    } finally {
      setPending(false);
    }
  };

  const toggleActive = async (item: InventoryItem) => {
    if (pendingRows.has(item.id)) return;
    setPendingRows((current) => new Set(current).add(item.id));
    try {
      await updateItem(item.id, { isActive: !item.isActive } as Partial<InventoryItem>);
      toast.success(item.isActive ? "Producto desactivado" : "Producto activado");
    } catch (e) {
      toast.error(userPersistenceMessage(e));
    } finally {
      setPendingRows((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  const printBarcode = () => window.print();

  const saveLabelSettings = async (patch: Partial<import("@/lib/types").Settings>) => {
    setSavingLabelSettings(true);
    try {
      const confirmed = await setSettings(patch);
      toast.success("Ajuste de etiqueta guardado");
      return confirmed;
    } catch (error) {
      toast.error(userPersistenceMessage(error));
      throw error;
    } finally {
      setSavingLabelSettings(false);
    }
  };

  const normalizedQuery = normalizeCatalogValue(q);
  const filtered = items.filter((i) => getCatalogSearchText(i).includes(normalizedQuery));

  return (
    <div>
      <PageHeader
        title="Inventario de Productos"
        description="Administra productos, categorías, precios y disponibilidad del catálogo."
        actions={
          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              if (!pending) setOpen(nextOpen);
            }}
          >
            <DialogTrigger asChild>
              <Button
                onClick={startNew}
                className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Nuevo producto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Editar producto" : "Nuevo producto de inventario"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="SKU / Código de barras">
                    <Input
                      data-testid="catalog-sku"
                      value={form.sku}
                      aria-invalid={Boolean(fieldErrors.sku)}
                      aria-describedby={
                        fieldErrors.sku ? "catalog-sku-error catalog-sku-help" : "catalog-sku-help"
                      }
                      onChange={(e) => {
                        setForm({ ...form, sku: e.target.value });
                        setFieldErrors((current) => ({ ...current, sku: undefined }));
                      }}
                    />
                    <p id="catalog-sku-help" className="text-xs text-muted-foreground">
                      El código sugerido se confirma como único al guardar.
                    </p>
                    {fieldErrors.sku && (
                      <p id="catalog-sku-error" className="text-sm text-destructive" role="alert">
                        {fieldErrors.sku}
                      </p>
                    )}
                  </Field>
                  <Field label="Nombre del producto" className="lg:col-span-2">
                    <Input
                      value={form.name}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "catalog-name-error" : undefined}
                      onChange={(e) => {
                        setForm({ ...form, name: e.target.value });
                        setFieldErrors((current) => ({ ...current, name: undefined }));
                      }}
                      placeholder="Nombre del producto"
                    />
                    {fieldErrors.name && (
                      <p id="catalog-name-error" className="text-sm text-destructive" role="alert">
                        {fieldErrors.name}
                      </p>
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Categoría">
                    <Input
                      data-testid="catalog-category"
                      value={form.category}
                      list="inventory-categories"
                      aria-invalid={Boolean(fieldErrors.category)}
                      aria-describedby={fieldErrors.category ? "catalog-category-error" : undefined}
                      onChange={(e) => {
                        setForm({ ...form, category: e.target.value });
                        setFieldErrors((current) => ({ ...current, category: undefined }));
                      }}
                      placeholder="Define una categoría"
                    />
                    <datalist id="inventory-categories">
                      {categories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                    {fieldErrors.category && (
                      <p
                        id="catalog-category-error"
                        className="text-sm text-destructive"
                        role="alert"
                      >
                        {fieldErrors.category}
                      </p>
                    )}
                  </Field>
                  <Field label="Marca / Fabricante">
                    <Input
                      value={form.brand || ""}
                      data-testid="catalog-brand"
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      placeholder="Grace Supply, Wahl, BaByliss"
                    />
                  </Field>
                  <Field label="Presentación / Tamaño">
                    <Input
                      value={form.presentation || ""}
                      data-testid="catalog-presentation"
                      onChange={(e) => setForm({ ...form, presentation: e.target.value })}
                      placeholder="250ml, 8.5 oz, N/A"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Unidad de medida">
                    <Input
                      data-testid="catalog-unit"
                      value={form.unit || ""}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="unidad, ml, g, caja…"
                    />
                  </Field>
                  <Field label="Estado del producto">
                    <div className="flex h-10 items-center gap-2">
                      <Switch
                        id="inventory-active"
                        checked={form.isActive}
                        onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                      />
                      <Label htmlFor="inventory-active">
                        {form.isActive ? "Activo" : "Inactivo"}
                      </Label>
                    </div>
                  </Field>
                  <Field label="Descripción" className="sm:col-span-2">
                    <Textarea
                      className="resize-none"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={2}
                    />
                  </Field>
                  <details className="col-span-full rounded-md border border-border px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">
                      Atributos adicionales (opcional)
                    </summary>
                    <div className="mt-3 space-y-2">
                      <p id="catalog-attributes-help" className="text-xs text-muted-foreground">
                        Agrega especificaciones opcionales en formato JSON. Déjalo vacío si no
                        necesitas atributos adicionales.
                      </p>
                      <Textarea
                        data-testid="catalog-attributes"
                        className="resize-y font-mono text-xs"
                        value={attributesText}
                        onChange={(e) => {
                          setAttributesText(e.target.value);
                          setFieldErrors((current) => ({ ...current, attributes: undefined }));
                        }}
                        rows={4}
                        aria-invalid={Boolean(fieldErrors.attributes)}
                        aria-describedby={
                          fieldErrors.attributes
                            ? "catalog-attributes-help catalog-attributes-error"
                            : "catalog-attributes-help"
                        }
                      />
                      {fieldErrors.attributes && (
                        <p
                          id="catalog-attributes-error"
                          className="text-sm text-destructive"
                          role="alert"
                        >
                          {fieldErrors.attributes}
                        </p>
                      )}
                    </div>
                  </details>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Costo de compra">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={costPriceText}
                      disabled={!isAdmin || pending}
                      aria-invalid={Boolean(fieldErrors.costPrice)}
                      aria-describedby={fieldErrors.costPrice ? "catalog-cost-error" : undefined}
                      onChange={(e) => setMoneyText("costPrice", e.target.value)}
                    />
                    {fieldErrors.costPrice && (
                      <p id="catalog-cost-error" className="text-sm text-destructive" role="alert">
                        {fieldErrors.costPrice}
                      </p>
                    )}
                  </Field>
                  <Field label="Precio de venta">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={priceText}
                      disabled={!isAdmin || pending}
                      aria-invalid={Boolean(fieldErrors.price)}
                      aria-describedby={fieldErrors.price ? "catalog-price-error" : undefined}
                      onChange={(e) => setMoneyText("price", e.target.value)}
                    />
                    {fieldErrors.price && (
                      <p id="catalog-price-error" className="text-sm text-destructive" role="alert">
                        {fieldErrors.price}
                      </p>
                    )}
                  </Field>
                  <Field label="Existencia (Stock)">
                    <Input
                      type="number"
                      value={form.quantity}
                      disabled
                      aria-describedby="stock-operation-note"
                    />
                  </Field>
                </div>
                <p id="stock-operation-note" className="text-xs text-muted-foreground">
                  El stock se actualiza al registrar una compra o venta autorizada.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button
                  onClick={save}
                  disabled={pending}
                  className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
                >
                  {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar producto"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por SKU, nombre, categoría, marca o presentación…"
          aria-label="Buscar en el catálogo"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <span>No se pudo cargar el catálogo: {loadError}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "producto" : "productos"}
          {q.trim() ? " encontrados" : " en el catálogo"}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-sm" aria-label="Productos del inventario">
          <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            <tr>
              <th className="text-left px-4 py-3.5">SKU</th>
              <th className="text-left px-4 py-3.5">Producto</th>
              <th className="text-left px-4 py-3.5">Detalles / Marca</th>
              <th className="text-right px-4 py-3.5">Precio</th>
              <th className="text-right px-4 py-3.5">Stock</th>
              <th className="px-4 py-3.5 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground" role="status">
                  Cargando catálogo…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  {q ? (
                    "No hay productos que coincidan con la búsqueda."
                  ) : loadError ? (
                    "El catálogo no está disponible."
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Package className="h-8 w-8 opacity-50" />
                      <span>Aún no hay productos. Registra el primero para comenzar.</span>
                      <Button onClick={startNew}>
                        <Plus className="mr-2 h-4 w-4" />
                        Crear primer producto
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((i) => {
                return (
                  <tr key={i.id} className="hover:bg-muted/30 transition-colors">
                    <td
                      className="max-w-40 break-all px-4 py-3.5 font-mono text-xs font-semibold text-muted-foreground"
                      title={i.sku}
                    >
                      {i.sku}
                    </td>
                    <td className="px-4 py-3.5">
                      <div
                        className={`flex items-center gap-2 break-words font-medium ${i.isActive ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <span title={i.name}>{i.name}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${i.isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}
                        >
                          {i.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      <div className="text-xs text-[#D4AF37] font-medium mt-0.5">{i.category}</div>
                    </td>
                    <td className="max-w-xs break-words px-4 py-3.5 text-xs text-muted-foreground">
                      {[i.brand, i.presentation, i.unit].filter(Boolean).join(" · ") ||
                        "Sin detalles adicionales"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-foreground">
                      {fmtMoney(i.price, settings.currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${i.quantity <= 1 ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-muted text-foreground"}`}
                      >
                        {i.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setBarcodeItem(i)}
                          title="Código de barras"
                          aria-label={`Código de barras para ${i.name}`}
                          disabled={pendingRows.has(i.id)}
                          className="hover:text-[#D4AF37]"
                        >
                          <BarcodeIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(i)}
                          disabled={pendingRows.has(i.id)}
                          className="hover:text-[#D4AF37]"
                          aria-label={`Editar ${i.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void toggleActive(i)}
                          disabled={pendingRows.has(i.id)}
                          aria-busy={pendingRows.has(i.id)}
                          className="hover:text-destructive"
                          aria-label={i.isActive ? `Desactivar ${i.name}` : `Activar ${i.name}`}
                        >
                          <Power className="h-4 w-4" />
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

      <Dialog open={!!barcodeItem} onOpenChange={(o) => !o && setBarcodeItem(null)}>
        <DialogContent
          style={{
            width: `clamp(320px, calc(${settings.labelWidthMm}mm + 80px), 90vw)`,
            maxWidth: "90vw",
            maxHeight: "90vh",
          }}
          className="overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="no-print">Código de barras imprimible</DialogTitle>
          </DialogHeader>
          {barcodeItem && (
            <div className="space-y-4">
              <div className="overflow-auto">
                <BarcodeLabel item={barcodeItem} settings={settings} />
              </div>
              <p className="text-sm text-muted-foreground" role="status">
                {settingsReadStatus === "failed"
                  ? "No se pudieron leer los ajustes de etiqueta. La vista previa muestra valores predeterminados; no se puede imprimir hasta volver a cargar los ajustes."
                  : "La vista previa y la impresión usan los últimos ajustes confirmados. La impresión se pausa mientras se guarda un cambio."}
              </p>
              <LabelSizeControls
                settings={settings}
                disabled={settingsReadStatus !== "ready" || savingLabelSettings}
                onChange={saveLabelSettings}
              />
            </div>
          )}
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={() => setBarcodeItem(null)}>
              Cerrar
            </Button>
            <Button
              onClick={printBarcode}
              disabled={settingsReadStatus !== "ready" || savingLabelSettings}
              className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
            >
              <Printer className="h-4 w-4 mr-1.5" /> Imprimir
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
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const hasDirectControl = Children.toArray(children).some(
    (child) => isValidElement(child) && (child.type === Input || child.type === Textarea),
  );
  const control = Children.map(children, (child) =>
    isValidElement(child) && (child.type === Input || child.type === Textarea)
      ? cloneElement(child as React.ReactElement<{ id?: string }>, { id })
      : child,
  );
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label
        htmlFor={hasDirectControl ? id : undefined}
        className="text-xs font-medium text-neutral-300"
      >
        {label}
      </Label>
      {control}
    </div>
  );
}

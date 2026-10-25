import { createFileRoute } from "@tanstack/react-router";
import { cloneElement, isValidElement, useId, useState } from "react";
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
import { getCatalogSearchText } from "@/lib/catalog.js";

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
  const [q, setQ] = useState("");
  const [barcodeItem, setBarcodeItem] = useState<InventoryItem | null>(null);
  const [savingLabelSettings, setSavingLabelSettings] = useState(false);
  const [pending, setPending] = useState(false);

  const startNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, sku: genSku() });
    setAttributesText("{}");
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
    setOpen(true);
  };

  const save = async () => {
    if (pending) return;
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
        category: form.category.trim(),
        description: form.description.trim(),
        brand: form.brand.trim() || null,
        presentation: form.presentation.trim() || null,
        unit: form.unit.trim() || null,
        attributes,
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
    } catch (e) {
      toast.error(userPersistenceMessage(e));
    } finally {
      setPending(false);
    }
  };

  const toggleActive = async (item: InventoryItem) => {
    try {
      await updateItem(item.id, { isActive: !item.isActive } as Partial<InventoryItem>);
      toast.success(item.isActive ? "Producto desactivado" : "Producto activado");
    } catch (e) {
      toast.error(userPersistenceMessage(e));
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

  const normalizedQuery = q.trim().toLocaleLowerCase("es-DO");
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
                <div className="grid grid-cols-3 gap-3">
                  <Field label="SKU / Código de barras">
                    <Input
                      data-testid="catalog-sku"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    />
                  </Field>
                  <Field label="Nombre del producto" className="col-span-2">
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Nombre del producto"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Categoría">
                    <Input
                      data-testid="catalog-category"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Define una categoría"
                    />
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

                <div className="grid grid-cols-2 gap-3">
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
                  <Field label="Descripción" className="col-span-2">
                    <Textarea
                      className="resize-none"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={2}
                    />
                  </Field>
                  <Field label="Atributos adicionales (JSON)" className="col-span-2">
                    <Textarea
                      className="resize-none font-mono text-xs"
                      value={attributesText}
                      onChange={(e) => setAttributesText(e.target.value)}
                      rows={3}
                      aria-describedby="catalog-attributes-help"
                    />
                    <p id="catalog-attributes-help" className="text-xs text-muted-foreground">
                      Usa un objeto JSON para variantes o especificaciones opcionales.
                    </p>
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Costo de compra">
                    <Input
                      type="number"
                      step="0.01"
                      value={form.costPrice}
                      disabled={!isAdmin || pending}
                      onChange={(e) => setForm({ ...form, costPrice: +e.target.value })}
                    />
                  </Field>
                  <Field label="Precio de venta">
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price}
                      disabled={!isAdmin || pending}
                      onChange={(e) => setForm({ ...form, price: +e.target.value })}
                    />
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
          placeholder="Buscar por nombre, SKU, marca, categoría…"
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

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
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
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-muted-foreground">
                      {i.sku}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        {i.name}
                      </div>
                      <div className="text-xs text-[#D4AF37] font-medium mt-0.5">{i.category}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {[i.brand, i.presentation, i.unit].filter(Boolean).join(" · ") ||
                        "Sin detalles adicionales"}
                      {!i.isActive && <div className="mt-1 text-amber-500">Inactivo</div>}
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
                          className="hover:text-[#D4AF37]"
                        >
                          <BarcodeIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(i)}
                          className="hover:text-[#D4AF37]"
                          aria-label={`Editar ${i.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void toggleActive(i)}
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
  const directControl =
    isValidElement(children) && (children.type === Input || children.type === Textarea);
  const control = directControl
    ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label
        htmlFor={directControl ? id : undefined}
        className="text-xs font-medium text-neutral-300"
      >
        {label}
      </Label>
      {control}
    </div>
  );
}

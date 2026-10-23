import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSupabaseTable, uid, fmtMoney } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { InventoryItem, ItemKind } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Barcode as BarcodeIcon, Printer, Search, Scissors, Package, Sparkles } from "lucide-react";

import { BarcodeLabel, LabelSizeControls } from "@/components/BarcodeLabel";
import { toast } from "sonner";
import { userPersistenceMessage } from "@/lib/persistence.js";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

const barberCategories: InventoryItem["category"][] = ["anillo", "collar", "pulsera", "arete", "dije", "reloj", "otro"];

const categoryLabels: Record<InventoryItem["category"], string> = {
  anillo: "Herramientas & Máquinas",
  collar: "Cuidado Capilar",
  pulsera: "Cuidado de Barba",
  arete: "Estética & Piel",
  dije: "Ceras & Pomadas",
  reloj: "Accesorios & Consumibles",
  piedra: "Insumo / Repuesto",
  otro: "Otro Producto",
};

const emptyForm: Omit<InventoryItem, "id" | "createdAt"> = {
  sku: "",
  kind: "joya",
  name: "",
  category: "anillo",
  metal: "Marca / Fabricante",
  karat: "Presentación (ej. 250ml / 8.5oz)",
  weightGrams: 0,
  stone: "",
  stoneCarats: 0,
  stoneCut: "",
  stoneClarity: "",
  stoneColor: "",
  sizeMm: 0,
  sizeLabel: "",
  costPrice: 0,
  price: 0,
  quantity: 0,
};

function genSku() {
  return "GS-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function InventoryPage() {
  const { isAdmin } = useAuth();
  const { data: items, insert: insertItem, update: updateItem, remove: removeItem } = useSupabaseTable<InventoryItem>("inventory");
  const [settings, setSettings] = useSettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState("");
  const [barcodeItem, setBarcodeItem] = useState<InventoryItem | null>(null);
  const [pending, setPending] = useState(false);

  const startNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, sku: genSku(), metal: "", karat: "" });
    setOpen(true);
  };

  const startEdit = (i: InventoryItem) => {
    setEditing(i);
    setForm({ ...emptyForm, ...i, kind: i.kind || "joya" });
    setOpen(true);
  };

  const setKind = (kind: ItemKind) => {
    if (kind === "piedra") {
      setForm({ ...form, kind, category: "piedra", metal: "", karat: "", sizeMm: 0, sizeLabel: "" });
    } else {
      setForm({
        ...form,
        kind,
        category: form.category === "piedra" ? "anillo" : form.category,
      });
    }
  };

  const save = async () => {
    if (pending) return;
    if (!form.name.trim() || !form.sku.trim()) {
      toast.error("Nombre y SKU son obligatorios");
      return;
    }
    setPending(true);
    try {
      if (editing) {
        const { quantity: _stock, ...metadataAndPrice } = form;
        await updateItem(editing.id, metadataAndPrice);
        toast.success("Producto actualizado");
      } else {
        await insertItem({ id: uid(), createdAt: new Date().toISOString(), ...form });
        toast.success("Producto agregado");
      }
      setOpen(false);
    } catch (e) {
      toast.error(userPersistenceMessage(e));
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este producto del inventario?")) return;
    try {
      await removeItem(id);
      toast.success("Producto eliminado");
    } catch (e) {
      toast.error(userPersistenceMessage(e));
    }
  };

  const printBarcode = () => window.print();

  const filtered = items.filter((i) =>
    [i.name, i.sku, i.metal, i.stone, categoryLabels[i.category]].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  const isInsumo = form.kind === "piedra";

  return (
    <div>
      <PageHeader
        title="Inventario de Productos"
        description="Catálogo de productos de barbería, estética, cuidado de barba, herramientas y accesorios."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={startNew} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
                <Plus className="h-4 w-4 mr-1.5" /> Nuevo producto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar producto" : "Nuevo producto de inventario"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <KindCard
                    active={form.kind === "joya"}
                    onClick={() => setKind("joya")}
                    icon={<Package className="h-4 w-4" />}
                    title="Producto Terminado"
                    hint="Artículo para venta directa"
                  />
                  <KindCard
                    active={form.kind === "piedra"}
                    onClick={() => setKind("piedra")}
                    icon={<Scissors className="h-4 w-4" />}
                    title="Insumo / Repuesto"
                    hint="Consumible o accesorio de uso interno"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="SKU / Código de barras">
                    <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                  </Field>
                  <Field label="Nombre del producto" className="col-span-2">
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={isInsumo ? "Cuchillas de Repuesto Wahl 5-Star" : "Cera Pomada Mate Grace Supply 150ml"}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Categoría">
                    <Select
                      value={form.category}
                      onValueChange={(v) => setForm({ ...form, category: v as InventoryItem["category"] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {barberCategories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {categoryLabels[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Marca / Fabricante">
                    <Input
                      value={form.metal || ""}
                      onChange={(e) => setForm({ ...form, metal: e.target.value })}
                      placeholder="Grace Supply, Wahl, BaByliss"
                    />
                  </Field>
                  <Field label="Presentación / Tamaño">
                    <Input
                      value={form.karat || ""}
                      onChange={(e) => setForm({ ...form, karat: e.target.value })}
                      placeholder="250ml, 8.5 oz, N/A"
                    />
                  </Field>
                </div>

                <div className="rounded-lg border border-border/80 p-3 space-y-3 bg-muted/20">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Detalles adicionales
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Especificación / Tipo">
                      <Input
                        value={form.stone || ""}
                        onChange={(e) => setForm({ ...form, stone: e.target.value })}
                        placeholder="ej. Fijación Fuerte / Aceite de Argán"
                      />
                    </Field>
                    <Field label="Contenido (ml/g/unid)">
                      <Input
                        type="number"
                        step="0.01"
                        value={form.stoneCarats || ""}
                        onChange={(e) => setForm({ ...form, stoneCarats: +e.target.value })}
                        placeholder="250"
                      />
                    </Field>
                    <Field label="Acabado / Variante">
                      <Input
                        value={form.stoneCut || ""}
                        onChange={(e) => setForm({ ...form, stoneCut: e.target.value })}
                        placeholder="Efecto Mate / Brillo Medio"
                      />
                    </Field>
                  </div>
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
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
                <Button onClick={save} disabled={pending} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Aún no hay productos registrados en el inventario.
                </td>
              </tr>
            ) : (
              filtered.map((i) => {
                const isConsumable = i.kind === "piedra";
                return (
                  <tr key={i.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-muted-foreground">{i.sku}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {isConsumable ? <Scissors className="h-3.5 w-3.5 text-[#D4AF37]" /> : <Package className="h-3.5 w-3.5 text-muted-foreground" />}
                        {i.name}
                      </div>
                      <div className="text-xs text-[#D4AF37] font-medium mt-0.5">
                        {categoryLabels[i.category] || i.category}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {[i.metal, i.karat, i.stone, i.stoneCut].filter(Boolean).join(" · ") || "Estándar"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-foreground">
                      {fmtMoney(i.price, settings.currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${i.quantity <= 1 ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-muted text-foreground"}`}>
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
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(i.id)}
                          className="hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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
              <LabelSizeControls settings={settings} onChange={(patch) => setSettings({ ...settings, ...patch })} />
            </div>
          )}
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={() => setBarcodeItem(null)}>Cerrar</Button>
            <Button onClick={printBarcode} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">
              <Printer className="h-4 w-4 mr-1.5" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className || ""}`}><Label className="text-xs font-medium text-neutral-300">{label}</Label>{children}</div>;
}

function KindCard({ active, onClick, icon, title, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition-all ${
        active
          ? "border-[#D4AF37] bg-[#D4AF37]/10 text-foreground shadow-sm shadow-[#D4AF37]/10"
          : "border-border hover:border-[#D4AF37]/50 text-muted-foreground"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={active ? "text-[#D4AF37]" : ""}>{icon}</span>
        {title}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}

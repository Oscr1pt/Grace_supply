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
import { Plus, Pencil, Trash2, Barcode as BarcodeIcon, Printer, Search, Gem, Package } from "lucide-react";

import { BarcodeLabel, LabelSizeControls } from "@/components/BarcodeLabel";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

const joyaCategories: InventoryItem["category"][] = ["anillo", "collar", "pulsera", "arete", "dije", "reloj", "otro"];

const categoryLabels: Record<InventoryItem["category"], string> = {
  anillo: "Anillo",
  collar: "Collar",
  pulsera: "Pulsera",
  arete: "Arete",
  dije: "Dije",
  reloj: "Reloj",
  piedra: "Piedra suelta",
  otro: "Otro",
};

const emptyForm: Omit<InventoryItem, "id" | "createdAt"> = {
  sku: "", kind: "joya", name: "", category: "anillo", metal: "Oro amarillo", karat: "18K",
  weightGrams: 0, stone: "", stoneCarats: 0, stoneCut: "", stoneClarity: "", stoneColor: "",
  sizeMm: 0, sizeLabel: "", costPrice: 0, price: 0, quantity: 1,
};

function genSku() {
  return "JOY-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function InventoryPage() {
  const { data: items, insert: insertItem, update: updateItem, remove: removeItem } = useSupabaseTable<InventoryItem>("inventory");
  const [settings, setSettings] = useSettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState("");
  const [barcodeItem, setBarcodeItem] = useState<InventoryItem | null>(null);

  const startNew = () => { setEditing(null); setForm({ ...emptyForm, sku: genSku() }); setOpen(true); };
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
        metal: form.metal || "Oro amarillo",
        karat: form.karat || "18K",
      });
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.sku.trim()) { toast.error("Nombre y SKU son obligatorios"); return; }
    if (form.kind === "piedra" && !form.stone?.trim()) { toast.error("Indica el tipo de piedra"); return; }
    try {
      if (editing) {
        await updateItem(editing.id, form);
        toast.success("Pieza actualizada");
      } else {
        await insertItem({ id: uid(), createdAt: new Date().toISOString(), ...form });
        toast.success("Pieza agregada");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta pieza?")) return;
    try {
      await removeItem(id);
      toast.success("Pieza eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const printBarcode = () => window.print();

  const filtered = items.filter((i) =>
    [i.name, i.sku, i.metal, i.stone].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  const isStone = form.kind === "piedra";

  return (
    <div>
      <PageHeader
        title="Inventario"
        description="Joyas terminadas y piedras sueltas para montar."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={startNew}><Plus /> Nueva pieza</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Editar pieza" : "Nueva pieza de inventario"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <KindCard active={form.kind === "joya"} onClick={() => setKind("joya")} icon={<Package className="h-4 w-4" />} title="Joya completa" hint="Pieza terminada con metal" />
                  <KindCard active={form.kind === "piedra"} onClick={() => setKind("piedra")} icon={<Gem className="h-4 w-4" />} title="Piedra suelta" hint="Gema sin montar" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="SKU / Código de barras"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
                  <Field label="Nombre" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isStone ? "Diamante 1ct VS1" : "Anillo solitario 1ct"} /></Field>
                </div>

                {!isStone && (
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Categoría">
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as InventoryItem["category"] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{joyaCategories.map((c) => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <Field label="Metal"><Input value={form.metal || ""} onChange={(e) => setForm({ ...form, metal: e.target.value })} placeholder="Oro amarillo" /></Field>
                    <Field label="Quilates / Pureza"><Input value={form.karat || ""} onChange={(e) => setForm({ ...form, karat: e.target.value })} placeholder="18K, 925" /></Field>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Peso (g)"><Input type="number" step="0.01" value={form.weightGrams || ""} onChange={(e) => setForm({ ...form, weightGrams: +e.target.value })} /></Field>
                  {!isStone && <>
                    <Field label="Tamaño (mm)"><Input type="number" step="0.1" value={form.sizeMm || ""} onChange={(e) => setForm({ ...form, sizeMm: +e.target.value })} /></Field>
                    <Field label="Talla"><Input value={form.sizeLabel || ""} onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })} placeholder="MX 7 / 18 cm" /></Field>
                  </>}
                </div>

                <div className="rounded-md border border-border p-3 space-y-3 bg-muted/30">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Detalles de la piedra {isStone && <span className="text-destructive">*</span>}</div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Piedra"><Input value={form.stone || ""} onChange={(e) => setForm({ ...form, stone: e.target.value })} placeholder="Diamante" /></Field>
                    <Field label="Quilates (ct)"><Input type="number" step="0.01" value={form.stoneCarats || ""} onChange={(e) => setForm({ ...form, stoneCarats: +e.target.value })} /></Field>
                    <Field label="Corte"><Input value={form.stoneCut || ""} onChange={(e) => setForm({ ...form, stoneCut: e.target.value })} placeholder="Brillante redondo" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Claridad"><Input value={form.stoneClarity || ""} onChange={(e) => setForm({ ...form, stoneClarity: e.target.value })} placeholder="VS1" /></Field>
                    <Field label="Color"><Input value={form.stoneColor || ""} onChange={(e) => setForm({ ...form, stoneColor: e.target.value })} placeholder="F" /></Field>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Costo"><Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: +e.target.value })} /></Field>
                  <Field label="Precio venta"><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></Field>
                  <Field label="Cantidad"><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} /></Field>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save}>{editing ? "Guardar cambios" : "Agregar pieza"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre, SKU, piedra…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">SKU</th>
              <th className="text-left px-4 py-3">Pieza</th>
              <th className="text-left px-4 py-3">Especificaciones</th>
              <th className="text-right px-4 py-3">Precio</th>
              <th className="text-right px-4 py-3">Cant.</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Aún no hay inventario.</td></tr>
            ) : filtered.map((i) => {
              const stone = i.kind === "piedra";
              return (
                <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{i.sku}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-2">
                      {stone && <Gem className="h-3.5 w-3.5 text-primary" />}
                      {i.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{categoryLabels[i.category] || i.category}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {stone
                      ? `${i.stone || "Piedra"} ${i.stoneCarats || 0}ct${i.stoneCut ? ` · ${i.stoneCut}` : ""}${i.stoneClarity ? ` · ${i.stoneClarity}` : ""}`
                      : `${i.karat || ""} ${i.metal || ""}${i.weightGrams ? ` · ${i.weightGrams}g` : ""}${i.stone ? ` · ${i.stone} ${i.stoneCarats || 0}ct` : ""}${i.sizeLabel ? ` · ${i.sizeLabel}` : ""}`}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMoney(i.price, settings.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={i.quantity <= 1 ? "text-destructive font-medium" : ""}>{i.quantity}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setBarcodeItem(i)} title="Código de barras"><BarcodeIcon className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => startEdit(i)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
          <DialogHeader><DialogTitle className="no-print">Código de barras imprimible</DialogTitle></DialogHeader>
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
            <Button onClick={printBarcode}><Printer /> Imprimir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className || ""}`}><Label>{label}</Label>{children}</div>;
}

function KindCard({ active, onClick, icon, title, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border p-3 transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}

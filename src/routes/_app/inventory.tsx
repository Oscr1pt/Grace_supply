import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLocalStore, uid, fmtMoney } from "@/lib/storage";
import { useSettings } from "@/lib/settings";
import type { InventoryItem } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Barcode as BarcodeIcon, Printer, Search } from "lucide-react";
import { Barcode } from "@/components/Barcode";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
});

const categories: InventoryItem["category"][] = ["ring", "necklace", "bracelet", "earring", "pendant", "watch", "other"];

const emptyForm: Omit<InventoryItem, "id" | "createdAt"> = {
  sku: "", name: "", category: "ring", metal: "Yellow Gold", karat: "18K",
  weightGrams: 0, stone: "", stoneCarats: 0, stoneCut: "", stoneClarity: "", stoneColor: "",
  sizeMm: 0, sizeLabel: "", costPrice: 0, price: 0, quantity: 1,
};

function genSku() {
  return "JWL-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function InventoryPage() {
  const [items, setItems] = useLocalStore<InventoryItem[]>("lustre_inventory", []);
  const [settings] = useSettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState("");
  const [barcodeItem, setBarcodeItem] = useState<InventoryItem | null>(null);

  const startNew = () => { setEditing(null); setForm({ ...emptyForm, sku: genSku() }); setOpen(true); };
  const startEdit = (i: InventoryItem) => { setEditing(i); setForm(i); setOpen(true); };

  const save = () => {
    if (!form.name.trim() || !form.sku.trim()) { toast.error("Name and SKU are required"); return; }
    if (editing) {
      setItems(items.map((x) => (x.id === editing.id ? { ...editing, ...form } : x)));
      toast.success("Item updated");
    } else {
      setItems([{ id: uid(), createdAt: new Date().toISOString(), ...form }, ...items]);
      toast.success("Item added");
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    if (!confirm("Delete this item?")) return;
    setItems(items.filter((x) => x.id !== id));
    toast.success("Item deleted");
  };

  const printBarcode = () => {
    window.print();
  };

  const filtered = items.filter((i) =>
    [i.name, i.sku, i.metal, i.stone].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Track every piece in your collection."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={startNew}><Plus /> New item</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Edit item" : "New inventory item"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="SKU / Barcode"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
                  <Field label="Name" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="1ct Solitaire Ring" /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Category">
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as InventoryItem["category"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Metal"><Input value={form.metal} onChange={(e) => setForm({ ...form, metal: e.target.value })} placeholder="Yellow Gold" /></Field>
                  <Field label="Karat / Fineness"><Input value={form.karat} onChange={(e) => setForm({ ...form, karat: e.target.value })} placeholder="18K, 925" /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Weight (g)"><Input type="number" step="0.01" value={form.weightGrams} onChange={(e) => setForm({ ...form, weightGrams: +e.target.value })} /></Field>
                  <Field label="Size (mm)"><Input type="number" step="0.1" value={form.sizeMm || ""} onChange={(e) => setForm({ ...form, sizeMm: +e.target.value })} /></Field>
                  <Field label="Size label"><Input value={form.sizeLabel || ""} onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })} placeholder="US 7 / 18 in" /></Field>
                </div>
                <div className="rounded-md border border-border p-3 space-y-3 bg-muted/30">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Stone details</div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Stone"><Input value={form.stone || ""} onChange={(e) => setForm({ ...form, stone: e.target.value })} placeholder="Diamond" /></Field>
                    <Field label="Carats"><Input type="number" step="0.01" value={form.stoneCarats || ""} onChange={(e) => setForm({ ...form, stoneCarats: +e.target.value })} /></Field>
                    <Field label="Cut"><Input value={form.stoneCut || ""} onChange={(e) => setForm({ ...form, stoneCut: e.target.value })} placeholder="Round Brilliant" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Clarity"><Input value={form.stoneClarity || ""} onChange={(e) => setForm({ ...form, stoneClarity: e.target.value })} placeholder="VS1" /></Field>
                    <Field label="Color"><Input value={form.stoneColor || ""} onChange={(e) => setForm({ ...form, stoneColor: e.target.value })} placeholder="F" /></Field>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Cost price"><Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: +e.target.value })} /></Field>
                  <Field label="Sale price"><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></Field>
                  <Field label="Quantity"><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} /></Field>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save}>{editing ? "Save changes" : "Add item"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, SKU, stone…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">SKU</th>
              <th className="text-left px-4 py-3">Item</th>
              <th className="text-left px-4 py-3">Specs</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Qty</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No inventory yet.</td></tr>
            ) : filtered.map((i) => (
              <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{i.sku}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{i.category}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {i.karat} {i.metal} · {i.weightGrams}g
                  {i.stone ? ` · ${i.stone} ${i.stoneCarats || 0}ct` : ""}
                  {i.sizeLabel ? ` · ${i.sizeLabel}` : ""}
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtMoney(i.price, settings.currency)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={i.quantity <= 1 ? "text-destructive font-medium" : ""}>{i.quantity}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setBarcodeItem(i)} title="Barcode"><BarcodeIcon className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(i)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!barcodeItem} onOpenChange={(o) => !o && setBarcodeItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="no-print">Printable barcode</DialogTitle></DialogHeader>
          {barcodeItem && (
            <div id="barcode-print" className="bg-white text-black p-6 rounded-md text-center">
              <div className="font-display text-lg">{settings.businessName}</div>
              <div className="text-sm mt-1">{barcodeItem.name}</div>
              <div className="text-xs text-gray-600 mt-0.5">{barcodeItem.karat} {barcodeItem.metal} · {fmtMoney(barcodeItem.price, settings.currency)}</div>
              <div className="flex justify-center mt-4">
                <Barcode value={barcodeItem.sku} height={80} />
              </div>
            </div>
          )}
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={() => setBarcodeItem(null)}>Close</Button>
            <Button onClick={printBarcode}><Printer /> Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className || ""}`}><Label>{label}</Label>{children}</div>;
}

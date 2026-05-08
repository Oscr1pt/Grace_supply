import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLocalStore, uid, fmtMoney, fmtDate } from "@/lib/storage";
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
  const [purchases, setPurchases] = useLocalStore<Purchase[]>("lustre_purchases", []);
  const [inventory, setInventory] = useLocalStore<InventoryItem[]>("lustre_inventory", []);
  const [settings] = useSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [restock, setRestock] = useState(true);

  const save = () => {
    if (!form.supplier.trim()) { toast.error("Supplier is required"); return; }
    const total = form.quantity * form.unitCost;
    setPurchases([{ id: uid(), createdAt: new Date().toISOString(), total, ...form }, ...purchases]);
    if (restock && form.itemId) {
      setInventory(inventory.map((i) => i.id === form.itemId ? { ...i, quantity: i.quantity + form.quantity } : i));
    }
    toast.success("Purchase logged");
    setOpen(false);
    setForm(empty);
  };

  const remove = (id: string) => {
    if (!confirm("Delete this purchase?")) return;
    setPurchases(purchases.filter((p) => p.id !== id));
  };

  const itemName = (id?: string) => inventory.find((i) => i.id === id)?.name;

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Restock and supplier expenses."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus /> New purchase</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New purchase</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Supplier"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Antwerp Diamonds Co." /></Field>
                <Field label="Linked inventory item (optional)">
                  <Select value={form.itemId || "none"} onValueChange={(v) => setForm({ ...form, itemId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {inventory.map((i) => <SelectItem key={i.id} value={i.id}>{i.sku} — {i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Loose diamonds, 1ct VS1…" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity"><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} /></Field>
                  <Field label="Unit cost"><Input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: +e.target.value })} /></Field>
                </div>
                {form.itemId && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                    Increase linked item stock by {form.quantity}
                  </label>
                )}
                <div className="text-right text-sm">
                  Total: <span className="font-mono font-semibold">{fmtMoney(form.quantity * form.unitCost, settings.currency)}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save}>Log purchase</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Supplier</th>
              <th className="text-left px-4 py-3">Item / description</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-right px-4 py-3">Qty</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No purchases yet.</td></tr>
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

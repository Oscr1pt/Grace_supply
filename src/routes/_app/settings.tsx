import { createFileRoute } from "@tanstack/react-router";
import { useSettings, defaultSettings } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [settings, setSettings] = useSettings();
  const [form, setForm] = useState(settings);

  const save = () => {
    setSettings(form);
    toast.success("Settings saved");
  };

  const reset = () => {
    setForm(defaultSettings);
    setSettings(defaultSettings);
    toast.success("Reset to defaults");
  };

  return (
    <div>
      <PageHeader title="Settings" description="Business profile, tax rate and currency." />

      <div className="rounded-lg border border-border bg-card p-6 max-w-xl space-y-4">
        <Field label="Business name"><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
        <Field label="Address"><Input value={form.businessAddress} onChange={(e) => setForm({ ...form, businessAddress: e.target.value })} /></Field>
        <Field label="Phone"><Input value={form.businessPhone} onChange={(e) => setForm({ ...form, businessPhone: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sales tax rate (%)"><Input type="number" step="0.001" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: +e.target.value })} /></Field>
          <Field label="Currency code"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="USD" /></Field>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={save}>Save settings</Button>
          <Button variant="outline" onClick={reset}>Reset to defaults</Button>
        </div>
      </div>

      <div className="rounded-lg border border-destructive/30 bg-card p-6 max-w-xl mt-6">
        <h3 className="font-display text-lg">Danger zone</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Wipe all local data (clients, inventory, sales, purchases).
        </p>
        <Button
          variant="destructive"
          className="mt-3"
          onClick={() => {
            if (!confirm("This will delete all data. Continue?")) return;
            ["lustre_clients", "lustre_inventory", "lustre_sales", "lustre_purchases"].forEach((k) => localStorage.removeItem(k));
            toast.success("All data cleared");
            setTimeout(() => window.location.reload(), 600);
          }}
        >
          Clear all data
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

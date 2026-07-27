import { createFileRoute } from "@tanstack/react-router";
import { useSettings, defaultSettings } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelSizeControls } from "@/components/BarcodeLabel";
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
    toast.success("Ajustes guardados");
  };

  const reset = () => {
    setForm(defaultSettings);
    setSettings(defaultSettings);
    toast.success("Restablecido a valores por defecto");
  };

  return (
    <div>
      <PageHeader title="Ajustes" description="Datos del negocio, impuesto y moneda." />

      <div className="rounded-lg border border-border bg-card p-6 max-w-xl space-y-4">
        <Field label="Nombre del negocio"><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
        <Field label="Dirección"><Input value={form.businessAddress} onChange={(e) => setForm({ ...form, businessAddress: e.target.value })} /></Field>
        <Field label="Teléfono"><Input value={form.businessPhone} onChange={(e) => setForm({ ...form, businessPhone: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tasa de impuesto (%)"><Input type="number" step="0.001" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: +e.target.value })} /></Field>
          <Field label="Código de moneda"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="DOP" /></Field>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={save}>Guardar ajustes</Button>
          <Button variant="outline" onClick={reset}>Restablecer</Button>
        </div>
      </div>

      <div className="max-w-xl mt-6">
        <h3 className="font-display text-lg mb-2">Etiquetas de código de barras</h3>
        <LabelSizeControls settings={settings} onChange={(patch) => setSettings({ ...settings, ...patch })} />
      </div>



      <div className="rounded-lg border border-destructive/30 bg-card p-6 max-w-xl mt-6">
        <h3 className="font-display text-lg">Zona de peligro</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Borra todos los datos locales (clientes, inventario, ventas, compras).
        </p>
        <Button
          variant="destructive"
          className="mt-3"
          onClick={() => {
            if (!confirm("Esto eliminará todos los datos. ¿Continuar?")) return;
            ["lustre_clients", "lustre_inventory", "lustre_sales", "lustre_purchases"].forEach((k) => localStorage.removeItem(k));
            toast.success("Todos los datos borrados");
            setTimeout(() => window.location.reload(), 600);
          }}
        >
          Borrar todos los datos
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

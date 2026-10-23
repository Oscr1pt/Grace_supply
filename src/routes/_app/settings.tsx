import { createFileRoute } from "@tanstack/react-router";
import { useSettings, defaultSettings } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelSizeControls } from "@/components/BarcodeLabel";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { userPersistenceMessage } from "@/lib/persistence.js";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [settings, setSettings] = useSettings();
  const [form, setForm] = useState(settings);
  const [pending, setPending] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setForm(settings);
  }, [settings]);

  const editForm = (patch: Partial<typeof form>) => {
    dirty.current = true;
    setForm((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    if (pending) return;
    setPending(true);
    try {
      const confirmed = await setSettings(form);
      dirty.current = false;
      setForm(confirmed);
      toast.success("Ajustes guardados");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  const reset = async () => {
    if (pending) return;
    setPending(true);
    try {
      await setSettings(defaultSettings);
      dirty.current = false;
      setForm(defaultSettings);
      toast.success("Restablecido a valores por defecto");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <PageHeader title="Ajustes" description="Datos del negocio, impuesto y moneda." />

      <div className="rounded-lg border border-border bg-card p-6 max-w-xl space-y-4">
        <Field label="Nombre del negocio"><Input value={form.businessName} disabled={pending} onChange={(e) => editForm({ businessName: e.target.value })} /></Field>
        <Field label="Dirección"><Input value={form.businessAddress} disabled={pending} onChange={(e) => editForm({ businessAddress: e.target.value })} /></Field>
        <Field label="Teléfono"><Input value={form.businessPhone} disabled={pending} onChange={(e) => editForm({ businessPhone: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tasa de impuesto (%)"><Input type="number" step="0.001" value={form.taxRate} disabled={pending} onChange={(e) => editForm({ taxRate: +e.target.value })} /></Field>
          <Field label="Código de moneda"><Input value="DOP" readOnly /></Field>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={pending} className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0">{pending ? "Guardando…" : "Guardar ajustes"}</Button>
          <Button variant="outline" onClick={reset} disabled={pending}>{pending ? "Guardando…" : "Restablecer"}</Button>
        </div>
      </div>

      <div className="max-w-xl mt-6">
        <h3 className="font-display text-lg mb-2">Etiquetas de código de barras</h3>
        <LabelSizeControls settings={settings} disabled={pending} onChange={(patch) => {
          if (pending) return;
          setPending(true);
          void setSettings({ ...settings, ...patch }).then(() => {
            toast.success("Ajuste de etiqueta guardado");
          }).catch((error: unknown) => {
            toast.error(userPersistenceMessage(error));
          }).finally(() => setPending(false));
        }} />
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
            try {
              ["lustre_clients", "lustre_inventory", "lustre_sales", "lustre_purchases"].forEach((k) => localStorage.removeItem(k));
              toast.success("Caché local borrada; los datos remotos no se modificaron.");
              setTimeout(() => window.location.reload(), 600);
            } catch {
              toast.error("No se pudo borrar la caché local.");
            }
          }}
        >
          Borrar caché local
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

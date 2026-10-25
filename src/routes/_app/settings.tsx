import { createFileRoute } from "@tanstack/react-router";
import { useSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelSizeControls } from "@/components/BarcodeLabel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { validateBusinessSettings } from "@/lib/settings-validation.js";
import { userPersistenceMessage } from "@/lib/persistence.js";
import { clearSettingsCache } from "@/lib/settings-cache.js";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

type SettingsForm = Omit<Settings, "taxRate"> & { taxRate: string };
type FormErrors = Partial<Record<keyof SettingsForm, string>>;

function toForm(settings: Settings): SettingsForm {
  return { ...settings, taxRate: String(settings.taxRate) };
}

function SettingsPage() {
  const [settings, setSettings, readStatus] = useSettings();
  const [form, setForm] = useState<SettingsForm>(() => toForm(settings));
  const [errors, setErrors] = useState<FormErrors>({});
  const [businessState, setBusinessState] = useState<"saved" | "dirty" | "saving" | "failed">(
    "saved",
  );
  const [savingLabels, setSavingLabels] = useState(false);
  const [resetting, setResetting] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setForm(toForm(settings));
  }, [settings]);

  const editForm = (patch: Partial<SettingsForm>) => {
    dirty.current = true;
    setBusinessState("dirty");
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as (keyof SettingsForm)[]) delete next[key];
      return next;
    });
  };

  const save = async () => {
    if (businessState === "saving" || readStatus !== "ready") return;
    const validation = validateBusinessSettings(form);
    setErrors(validation);
    const firstInvalid = Object.keys(validation)[0] as keyof SettingsForm | undefined;
    if (firstInvalid) {
      document.getElementById(`settings-${firstInvalid}`)?.focus();
      setBusinessState("dirty");
      return;
    }

    setBusinessState("saving");
    try {
      const confirmed = await setSettings({
        businessName: form.businessName.trim(),
        businessAddress: form.businessAddress.trim(),
        businessPhone: form.businessPhone.trim(),
        taxRate: Number(form.taxRate),
      });
      dirty.current = false;
      setForm(toForm(confirmed));
      setBusinessState("saved");
      toast.success("Ajustes del negocio guardados");
    } catch (error) {
      setBusinessState("failed");
      toast.error(userPersistenceMessage(error));
    }
  };

  const reset = async () => {
    if (resetting || readStatus !== "ready") return;
    setResetting(true);
    try {
      const confirmed = await setSettings({
        businessName: "GRACE SUPPLY",
        businessAddress: "Santo Domingo, República Dominicana",
        businessPhone: "+1 (809) 000-0000",
        taxRate: 18,
        currency: "DOP",
        labelWidthMm: 50,
        labelHeightMm: 30,
        labelBarWidth: 2,
        labelBarHeight: 50,
        labelShowPrice: true,
      });
      dirty.current = false;
      setForm(toForm(confirmed));
      setErrors({});
      setBusinessState("saved");
      toast.success("Ajustes predeterminados guardados");
    } catch (error) {
      toast.error(userPersistenceMessage(error));
    } finally {
      setResetting(false);
    }
  };

  const saveLabelPatch = async (patch: Partial<Settings>) => {
    setSavingLabels(true);
    try {
      const confirmed = await setSettings(patch);
      toast.success("Ajuste de etiqueta guardado");
      return confirmed;
    } catch (error) {
      toast.error(userPersistenceMessage(error));
      throw error;
    } finally {
      setSavingLabels(false);
    }
  };

  const clearLocalCache = () => {
    if (clearSettingsCache(localStorage)) {
      toast.success(
        "Caché local del catálogo y registros borrada. Tu sesión y los datos de PostgreSQL siguen intactos.",
      );
      window.setTimeout(() => window.location.reload(), 600);
    } else {
      toast.error(
        "No se pudo completar la limpieza. Algunas claves locales podrían haberse borrado; vuelve a intentarlo.",
      );
    }
  };

  const stateMessage = {
    saved: "Cambios confirmados.",
    dirty: "Hay cambios pendientes de guardar.",
    saving: "Guardando ajustes…",
    failed: "No se guardaron los cambios. Puedes corregirlos o volver a intentarlo.",
  }[businessState];

  return (
    <div>
      <PageHeader title="Ajustes" description="Datos del negocio, impuesto y moneda." />

      {readStatus !== "ready" && (
        <p
          className="mb-4 max-w-xl rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          role="status"
        >
          {readStatus === "loading"
            ? "Cargando los ajustes confirmados…"
            : "No se pudieron leer los ajustes. No guardes valores predeterminados; vuelve a cargar la página para reintentar."}
        </p>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="rounded-lg border border-border bg-card p-6 max-w-xl space-y-4"
      >
        <Field label="Nombre del negocio" id="settings-businessName" error={errors.businessName}>
          <Input
            id="settings-businessName"
            value={form.businessName}
            maxLength={120}
            disabled={readStatus !== "ready" || businessState === "saving" || resetting}
            aria-invalid={Boolean(errors.businessName)}
            aria-describedby={errors.businessName ? "settings-businessName-error" : undefined}
            onChange={(e) => editForm({ businessName: e.target.value })}
          />
        </Field>
        <Field label="Dirección" id="settings-businessAddress" error={errors.businessAddress}>
          <Input
            id="settings-businessAddress"
            value={form.businessAddress}
            maxLength={240}
            disabled={readStatus !== "ready" || businessState === "saving" || resetting}
            aria-invalid={Boolean(errors.businessAddress)}
            aria-describedby={errors.businessAddress ? "settings-businessAddress-error" : undefined}
            onChange={(e) => editForm({ businessAddress: e.target.value })}
          />
        </Field>
        <Field
          label="Teléfono de contacto"
          id="settings-businessPhone"
          error={errors.businessPhone}
        >
          <Input
            id="settings-businessPhone"
            type="tel"
            autoComplete="tel"
            value={form.businessPhone}
            maxLength={30}
            disabled={readStatus !== "ready" || businessState === "saving" || resetting}
            aria-invalid={Boolean(errors.businessPhone)}
            aria-describedby={errors.businessPhone ? "settings-businessPhone-error" : undefined}
            onChange={(e) => editForm({ businessPhone: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tasa de impuesto (%)" id="settings-taxRate" error={errors.taxRate}>
            <Input
              id="settings-taxRate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              value={form.taxRate}
              disabled={readStatus !== "ready" || businessState === "saving" || resetting}
              aria-invalid={Boolean(errors.taxRate)}
              aria-describedby={`settings-taxRate-help${errors.taxRate ? " settings-taxRate-error" : ""}`}
              onChange={(e) => editForm({ taxRate: e.target.value })}
            />
          </Field>
          <Field label="Código de moneda" id="settings-currency">
            <Input id="settings-currency" value="DOP" readOnly />
          </Field>
        </div>
        <p id="settings-taxRate-help" className="text-sm text-muted-foreground">
          Configurar una tasa no aprueba la política fiscal ni habilita las ventas. La aprobación se
          gestiona por separado.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            type="submit"
            disabled={readStatus !== "ready" || businessState === "saving" || resetting}
            aria-busy={businessState === "saving"}
            className="bg-[#D4AF37] text-black hover:bg-[#E5C158] font-semibold border-0"
          >
            {businessState === "saving" ? "Guardando…" : "Guardar ajustes"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={
                  readStatus !== "ready" || resetting || businessState === "saving" || savingLabels
                }
              >
                {resetting ? "Restableciendo…" : "Restablecer valores"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restablecer los ajustes del negocio</AlertDialogTitle>
                <AlertDialogDescription>
                  Se guardarán en la base de datos el nombre, dirección, teléfono, tasa, moneda y
                  configuración de etiquetas predeterminados. Esta acción sustituye los valores
                  actuales.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void reset()}>
                  Guardar valores predeterminados
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {stateMessage}
          </span>
        </div>
      </form>

      <div className="max-w-xl mt-6">
        <h3 className="font-display text-lg mb-2">Etiquetas de código de barras</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Los cambios se guardan tras cada ajuste. Si falla el guardado, puedes volver a intentarlo.
        </p>
        <LabelSizeControls
          settings={settings}
          disabled={readStatus !== "ready" || savingLabels || resetting}
          onChange={saveLabelPatch}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6 max-w-xl mt-6">
        <h3 className="font-display text-lg">Caché local</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Borra solo las listas guardadas en este navegador (clientes, inventario, ventas y
          compras). No elimina datos de PostgreSQL ni cierra tu sesión.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-3">
              Borrar caché local
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Borrar las listas guardadas en este navegador</AlertDialogTitle>
              <AlertDialogDescription>
                Se quitarán únicamente las claves locales de clientes, inventario, ventas y compras.
                La sesión, los tokens de autenticación y los datos de PostgreSQL no se modificarán.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={clearLocalCache}>Borrar caché local</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

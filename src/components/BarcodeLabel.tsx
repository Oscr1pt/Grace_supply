import { Barcode } from "@/components/Barcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { labelPresets } from "@/lib/settings";
import { fmtMoney } from "@/lib/storage";
import type { InventoryItem, Settings } from "@/lib/types";
import { getBarcodeProductDetails } from "@/lib/catalog.js";

export function LabelSizeControls({
  settings,
  onChange,
  disabled = false,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<Settings>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [numericText, setNumericText] = useState<
    Partial<Record<"labelWidthMm" | "labelHeightMm" | "labelBarWidth" | "labelBarHeight", string>>
  >({});
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"labelWidthMm" | "labelHeightMm" | "labelBarWidth" | "labelBarHeight", string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Ajustes confirmados.");
  const [failedPatch, setFailedPatch] = useState<Partial<Settings> | null>(null);
  const visibleSettings = { ...settings, ...draft };
  const change = async (patch: Partial<Settings>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaving(true);
    setMessage("Guardando ajuste de etiqueta…");
    try {
      await onChange(patch);
      setFailedPatch(null);
      setMessage("Ajuste de etiqueta confirmado.");
    } catch {
      setFailedPatch(patch);
      setMessage("No se guardó el ajuste. Tus cambios siguen aquí; puedes reintentarlo.");
    } finally {
      setSaving(false);
    }
  };

  const changeNumber = (
    key: "labelWidthMm" | "labelHeightMm" | "labelBarWidth" | "labelBarHeight",
    raw: string,
    min: number,
    max: number,
  ) => {
    setNumericText((current) => ({ ...current, [key]: raw }));
    const pattern = /^(?:\d+\.?\d*|\.\d+)$/;
    const value = Number(raw);
    if (!pattern.test(raw) || !Number.isFinite(value) || value < min || value > max) {
      setFieldErrors((current) => ({ ...current, [key]: `Usa un número entre ${min} y ${max}.` }));
      setMessage("Corrige los campos de etiqueta antes de guardar.");
      return;
    }
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setNumericText((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    void change({ [key]: value });
  };

  useEffect(() => {
    const pendingKeys = Object.keys(draft) as (keyof Settings)[];
    if (pendingKeys.length && pendingKeys.every((key) => draft[key] === settings[key])) {
      setDraft({});
      setNumericText({});
      setFieldErrors({});
    }
  }, [settings, draft]);

  const activePreset = labelPresets.find(
    (p) =>
      p.widthMm === visibleSettings.labelWidthMm && p.heightMm === visibleSettings.labelHeightMm,
  )?.key;

  return (
    <div className="no-print space-y-3 rounded-md border border-border p-4" aria-busy={saving}>
      <div className="space-y-1.5">
        <Label htmlFor="label-size-preset">Tamaño de etiqueta</Label>
        <Select
          value={activePreset ?? "custom"}
          disabled={disabled || saving}
          onValueChange={(v) => {
            const p = labelPresets.find((x) => x.key === v);
            if (!p) return;
            change({
              labelWidthMm: p.widthMm,
              labelHeightMm: p.heightMm,
              labelBarWidth: p.barWidth,
              labelBarHeight: p.barHeight,
            });
          }}
        >
          <SelectTrigger id="label-size-preset">
            <SelectValue placeholder="Personalizado" />
          </SelectTrigger>
          <SelectContent>
            {labelPresets.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="label-width-mm">Ancho (mm)</Label>
          <Input
            id="label-width-mm"
            type="number"
            min={10}
            max={150}
            step="0.1"
            value={numericText.labelWidthMm ?? visibleSettings.labelWidthMm}
            disabled={disabled || saving}
            aria-invalid={Boolean(fieldErrors.labelWidthMm)}
            aria-describedby={fieldErrors.labelWidthMm ? "label-width-error" : undefined}
            onChange={(e) => changeNumber("labelWidthMm", e.target.value, 10, 150)}
          />
          {fieldErrors.labelWidthMm && (
            <p id="label-width-error" className="text-sm text-destructive" role="alert">
              {fieldErrors.labelWidthMm}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-height-mm">Alto (mm)</Label>
          <Input
            id="label-height-mm"
            type="number"
            min={8}
            max={100}
            step="0.1"
            value={numericText.labelHeightMm ?? visibleSettings.labelHeightMm}
            disabled={disabled || saving}
            aria-invalid={Boolean(fieldErrors.labelHeightMm)}
            aria-describedby={fieldErrors.labelHeightMm ? "label-height-error" : undefined}
            onChange={(e) => changeNumber("labelHeightMm", e.target.value, 8, 100)}
          />
          {fieldErrors.labelHeightMm && (
            <p id="label-height-error" className="text-sm text-destructive" role="alert">
              {fieldErrors.labelHeightMm}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-bar-width">Grosor de barras</Label>
          <Input
            id="label-bar-width"
            type="number"
            step="0.1"
            min={0.6}
            max={5}
            value={numericText.labelBarWidth ?? visibleSettings.labelBarWidth}
            disabled={disabled || saving}
            aria-invalid={Boolean(fieldErrors.labelBarWidth)}
            aria-describedby={fieldErrors.labelBarWidth ? "label-bar-width-error" : undefined}
            onChange={(e) => changeNumber("labelBarWidth", e.target.value, 0.6, 5)}
          />
          {fieldErrors.labelBarWidth && (
            <p id="label-bar-width-error" className="text-sm text-destructive" role="alert">
              {fieldErrors.labelBarWidth}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label-bar-height">Alto de barras (px)</Label>
          <Input
            id="label-bar-height"
            type="number"
            min={15}
            max={120}
            value={numericText.labelBarHeight ?? visibleSettings.labelBarHeight}
            disabled={disabled || saving}
            aria-invalid={Boolean(fieldErrors.labelBarHeight)}
            aria-describedby={fieldErrors.labelBarHeight ? "label-bar-height-error" : undefined}
            onChange={(e) => changeNumber("labelBarHeight", e.target.value, 15, 120)}
          />
          {fieldErrors.labelBarHeight && (
            <p id="label-bar-height-error" className="text-sm text-destructive" role="alert">
              {fieldErrors.labelBarHeight}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Label htmlFor="label-price">Mostrar precio en la etiqueta</Label>
        <Switch
          id="label-price"
          checked={visibleSettings.labelShowPrice}
          disabled={disabled || saving}
          onCheckedChange={(c) => void change({ labelShowPrice: c })}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {message}
        </p>
        {failedPatch && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void change(failedPatch)}
            disabled={disabled || saving}
          >
            Reintentar guardado
          </Button>
        )}
      </div>
    </div>
  );
}

export function BarcodeLabel({ item, settings }: { item: InventoryItem; settings: Settings }) {
  const specs = getBarcodeProductDetails(item);
  const compact = settings.labelHeightMm < 18;

  return (
    <>
      <style>{`@media print { @page { size: ${settings.labelWidthMm}mm ${settings.labelHeightMm}mm; margin: 0; } }`}</style>
      <div
        id="barcode-print"
        className="bg-white text-black rounded-sm border border-dashed border-gray-300 mx-auto flex flex-col items-center justify-center overflow-hidden"
        style={{
          width: `${settings.labelWidthMm}mm`,
          height: `${settings.labelHeightMm}mm`,
          padding: compact ? "1mm" : "2mm",
        }}
      >
        {!compact && (
          <div className="font-display leading-tight" style={{ fontSize: "9pt" }}>
            {settings.businessName}
          </div>
        )}
        <div
          className="leading-tight truncate max-w-full"
          style={{ fontSize: compact ? "5pt" : "7pt" }}
        >
          {item.name}
        </div>
        {!compact && specs && (
          <div className="text-gray-600 leading-tight" style={{ fontSize: "6pt" }}>
            {specs}
          </div>
        )}
        <Barcode
          value={item.sku}
          width={settings.labelBarWidth}
          height={settings.labelBarHeight}
          margin={2}
          fontSize={compact ? 8 : 11}
          className="max-w-full"
        />
        {settings.labelShowPrice && (
          <div
            className="font-semibold leading-tight"
            style={{ fontSize: compact ? "6pt" : "8pt" }}
          >
            {fmtMoney(item.price, settings.currency)}
          </div>
        )}
      </div>
    </>
  );
}

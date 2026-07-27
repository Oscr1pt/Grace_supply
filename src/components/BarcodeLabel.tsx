import { Barcode } from "@/components/Barcode";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { labelPresets } from "@/lib/settings";
import { fmtMoney } from "@/lib/storage";
import type { InventoryItem, Settings } from "@/lib/types";

export function LabelSizeControls({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const activePreset = labelPresets.find(
    (p) => p.widthMm === settings.labelWidthMm && p.heightMm === settings.labelHeightMm,
  )?.key;

  return (
    <div className="no-print space-y-3 rounded-md border border-border p-4">
      <div className="space-y-1.5">
        <Label>Tamaño de etiqueta</Label>
        <Select
          value={activePreset ?? "custom"}
          onValueChange={(v) => {
            const p = labelPresets.find((x) => x.key === v);
            if (!p) return;
            onChange({
              labelWidthMm: p.widthMm,
              labelHeightMm: p.heightMm,
              labelBarWidth: p.barWidth,
              labelBarHeight: p.barHeight,
            });
          }}
        >
          <SelectTrigger><SelectValue placeholder="Personalizado" /></SelectTrigger>
          <SelectContent>
            {labelPresets.map((p) => (
              <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
            ))}
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Ancho (mm)</Label>
          <Input type="number" min={10} value={settings.labelWidthMm}
            onChange={(e) => onChange({ labelWidthMm: Math.max(10, +e.target.value || 0) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Alto (mm)</Label>
          <Input type="number" min={8} value={settings.labelHeightMm}
            onChange={(e) => onChange({ labelHeightMm: Math.max(8, +e.target.value || 0) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Grosor de barras</Label>
          <Input type="number" step="0.1" min={0.6} value={settings.labelBarWidth}
            onChange={(e) => onChange({ labelBarWidth: Math.max(0.6, +e.target.value || 0) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Alto de barras (px)</Label>
          <Input type="number" min={15} value={settings.labelBarHeight}
            onChange={(e) => onChange({ labelBarHeight: Math.max(15, +e.target.value || 0) })} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Label htmlFor="label-price">Mostrar precio en la etiqueta</Label>
        <Switch id="label-price" checked={settings.labelShowPrice}
          onCheckedChange={(c) => onChange({ labelShowPrice: c })} />
      </div>
    </div>
  );
}

export function BarcodeLabel({ item, settings }: { item: InventoryItem; settings: Settings }) {
  const specs =
    item.kind === "piedra"
      ? `${item.stone || "Piedra"} ${item.stoneCarats || 0}ct`
      : `${item.karat || ""} ${item.metal || ""}`.trim();
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
        {!compact && <div className="font-display leading-tight" style={{ fontSize: "9pt" }}>{settings.businessName}</div>}
        <div className="leading-tight truncate max-w-full" style={{ fontSize: compact ? "5pt" : "7pt" }}>{item.name}</div>
        {!compact && specs && <div className="text-gray-600 leading-tight" style={{ fontSize: "6pt" }}>{specs}</div>}
        <Barcode
          value={item.sku}
          width={settings.labelBarWidth}
          height={settings.labelBarHeight}
          className="max-w-full"
        />
        {settings.labelShowPrice && (
          <div className="font-semibold leading-tight" style={{ fontSize: compact ? "6pt" : "8pt" }}>
            {fmtMoney(item.price, settings.currency)}
          </div>
        )}
      </div>
    </>
  );
}

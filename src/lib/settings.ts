import { useLocalStore } from "./storage";
import type { Settings } from "./types";

export const defaultSettings: Settings = {
  businessName: "IMPERIO GOLD JOYERIA",
  businessAddress: "Santo Domingo, República Dominicana",
  businessPhone: "+1 (809) 000-0000",
  taxRate: 18,
  currency: "DOP",
  labelWidthMm: 50,
  labelHeightMm: 30,
  labelBarWidth: 2,
  labelBarHeight: 50,
  labelShowPrice: true,
};

export const labelPresets = [
  { key: "joyeria", label: "Etiqueta joyería (25 × 12 mm)", widthMm: 25, heightMm: 12, barWidth: 1, barHeight: 22 },
  { key: "pequena", label: "Pequeña (38 × 19 mm)", widthMm: 38, heightMm: 19, barWidth: 1.4, barHeight: 32 },
  { key: "mediana", label: "Mediana (50 × 30 mm)", widthMm: 50, heightMm: 30, barWidth: 2, barHeight: 50 },
  { key: "grande", label: "Grande (70 × 40 mm)", widthMm: 70, heightMm: 40, barWidth: 2.6, barHeight: 65 },
] as const;

export function useSettings() {
  const [value, setValue] = useLocalStore<Settings>("lustre_settings", defaultSettings);
  return [{ ...defaultSettings, ...value }, setValue] as const;
}

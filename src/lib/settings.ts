import { useCallback, useEffect, useState } from "react";
import { supabase, fromDb, toDb } from "./supabase";
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

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);

  useEffect(() => {
    supabase
      .from("settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettingsState({ ...defaultSettings, ...fromDb<Partial<Settings>>(data as Record<string, unknown>) });
        }
      });
  }, []);

  const setSettings = useCallback(async (patch: Settings) => {
    setSettingsState(patch);
    await supabase
      .from("settings")
      .update(toDb(patch as unknown as Record<string, unknown>))
      .eq("id", SETTINGS_ID);
  }, []);

  return [settings, setSettings] as const;
}

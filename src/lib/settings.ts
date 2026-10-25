import { useCallback, useEffect, useState } from "react";
import { supabase, fromDb, toDb } from "./supabase";
import type { Settings } from "./types";
import type { UUID } from "./database.types";
import { confirmMutation, persistenceFailure, setReadFailure, userPersistenceMessage } from "./persistence.js";

export const defaultSettings: Settings = {
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
};

export const labelPresets = [
  { key: "compacta", label: "Compacta (25 × 12 mm)", widthMm: 25, heightMm: 12, barWidth: 1, barHeight: 22 },
  { key: "pequena", label: "Pequeña (38 × 19 mm)", widthMm: 38, heightMm: 19, barWidth: 1.4, barHeight: 32 },
  { key: "mediana", label: "Mediana (50 × 30 mm)", widthMm: 50, heightMm: 30, barWidth: 2, barHeight: 50 },
  { key: "grande", label: "Grande (70 × 40 mm)", widthMm: 70, heightMm: 40, barWidth: 2.6, barHeight: 65 },
] as const;

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("*")
          .eq("id", SETTINGS_ID as UUID)
          .single();
        if (error) {
          // Sales users receive only the receipt projection, never the settings table.
          const receipt = await supabase
            .from("sales_receipt_settings")
            .select("business_name,business_address,business_phone,tax_rate,currency")
            .maybeSingle();
          if (receipt.error || !receipt.data) throw persistenceFailure(error);
          if (active) {
            setSettingsState({
              ...defaultSettings,
              businessName: receipt.data.business_name,
              businessAddress: receipt.data.business_address,
              businessPhone: receipt.data.business_phone,
              taxRate: receipt.data.tax_rate,
              currency: receipt.data.currency,
            });
            setReadFailure("settings", null);
          }
          return;
        }
        if (!data) throw persistenceFailure(new Error("Settings row was not returned"));
        if (active) {
          setSettingsState({ ...defaultSettings, ...fromDb<Partial<Settings>>(data as Record<string, unknown>) });
          setReadFailure("settings", null);
        }
      } catch (error) {
        if (active) setReadFailure("settings", `${userPersistenceMessage(error)} Se muestran valores predeterminados hasta confirmar la lectura.`);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const setSettings = useCallback(async (patch: Settings) => {
    const response = await supabase
      .from("settings")
      .update(toDb(patch as unknown as Record<string, unknown>) as never)
      .eq("id", SETTINGS_ID as UUID)
      .select("*");
    const persisted = await confirmMutation(response, { id: SETTINGS_ID });
    const confirmed = { ...defaultSettings, ...fromDb<Partial<Settings>>(persisted as Record<string, unknown>) };
    setSettingsState(confirmed);
    return confirmed;
  }, []);

  return [settings, setSettings] as const;
}

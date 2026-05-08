import { useLocalStore } from "./storage";
import type { Settings } from "./types";

export const defaultSettings: Settings = {
  businessName: "IMPERIO GOLD JOYERIA",
  businessAddress: "Santo Domingo, República Dominicana",
  businessPhone: "+1 (809) 000-0000",
  taxRate: 18,
  currency: "DOP",
};

export function useSettings() {
  return useLocalStore<Settings>("lustre_settings", defaultSettings);
}

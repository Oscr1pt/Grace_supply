import { useLocalStore } from "./storage";
import type { Settings } from "./types";

export const defaultSettings: Settings = {
  businessName: "Lustre Joyería Fina",
  businessAddress: "Av. de los Diamantes 123, Ciudad",
  businessPhone: "+52 (55) 0102-2024",
  taxRate: 16,
  currency: "MXN",
};

export function useSettings() {
  return useLocalStore<Settings>("lustre_settings", defaultSettings);
}

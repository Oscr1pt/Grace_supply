import { useLocalStore } from "./storage";
import type { Settings } from "./types";

export const defaultSettings: Settings = {
  businessName: "IMPERIO GOLD JOYERIA",
  businessAddress: "Av. de los Diamantes 123, Ciudad",
  businessPhone: "(809)-123-4567",
  taxRate: 16,
  currency: "DOP",
};

export function useSettings() {
  return useLocalStore<Settings>("lustre_settings", defaultSettings);
}

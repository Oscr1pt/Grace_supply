import { useLocalStore } from "./storage";
import type { Settings } from "./types";

export const defaultSettings: Settings = {
  businessName: "Lustre Fine Jewelry",
  businessAddress: "123 Diamond Ave, New York, NY",
  businessPhone: "+1 (555) 010-2024",
  taxRate: 8.875,
  currency: "USD",
};

export function useSettings() {
  return useLocalStore<Settings>("lustre_settings", defaultSettings);
}

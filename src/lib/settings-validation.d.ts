import type { Settings } from "./types";

export type BusinessSettingsErrors = Partial<
  Record<"businessName" | "businessAddress" | "businessPhone" | "taxRate", string>
>;

export function validateBusinessSettings(
  settings: Pick<Settings, "businessName" | "businessAddress" | "businessPhone"> & {
    taxRate: string | number;
  },
): BusinessSettingsErrors;

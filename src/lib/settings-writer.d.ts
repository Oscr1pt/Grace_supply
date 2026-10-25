import type { Settings } from "./types";

export function createSettingsWriter(options: {
  getConfirmed: () => Settings;
  persist: (next: Settings, patch: Partial<Settings>) => Promise<Settings>;
  commit: (confirmed: Settings) => void;
}): (patch: Partial<Settings>) => Promise<Settings>;

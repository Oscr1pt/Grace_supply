export const settingsCacheKeys: readonly string[];

export function clearSettingsCache(storage: Pick<Storage, "removeItem">): boolean;

export const settingsCacheKeys = [
  "lustre_clients",
  "lustre_inventory",
  "lustre_sales",
  "lustre_purchases",
];

export function clearSettingsCache(storage) {
  try {
    for (const key of settingsCacheKeys) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

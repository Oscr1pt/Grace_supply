export function getBarcodeProductDetails(item) {
  return [item.brand, item.presentation, item.unit]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .join(" · ");
}

export function getCatalogSearchText(item) {
  return [
    item.name,
    item.sku,
    item.description,
    item.category,
    item.brand,
    item.presentation,
    item.unit,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-DO");
}

export function normalizeCatalogValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-DO");
}

export function resolveCatalogCategory(value, categories) {
  const trimmed = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!trimmed) return "";
  const normalized = normalizeCatalogValue(trimmed);
  return categories.find((category) => normalizeCatalogValue(category) === normalized) ?? trimmed;
}

export function getCatalogCategories(items) {
  const categories = new Map();
  for (const item of items) {
    const category =
      typeof item.category === "string" ? item.category.trim().replace(/\s+/g, " ") : "";
    const key = normalizeCatalogValue(category);
    if (key && !categories.has(key)) categories.set(key, category);
  }
  return [...categories.values()].sort((left, right) => left.localeCompare(right, "es-DO"));
}

export function parseCatalogMoney(raw) {
  if (typeof raw !== "string" || !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999999999999.99) return null;
  return amount;
}

export function parseCatalogAttributes(raw) {
  if (!raw.trim()) return { value: {}, error: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { value: null, error: "Revisa las comillas y separadores del JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { value: null, error: "Escribe un objeto con pares clave y valor." };
  }
  return { value: parsed, error: null };
}

export function clampSaleQuantity(requested, available) {
  const stock = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
  if (stock === 0) return 0;
  const quantity = Number.isFinite(requested) ? Math.floor(requested) : 1;
  return Math.min(stock, Math.max(1, quantity));
}

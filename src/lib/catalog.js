export function getBarcodeProductDetails(item) {
  return [item.brand, item.presentation, item.unit]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .join(" · ");
}

export function getCatalogSearchText(item) {
  return [item.name, item.sku, item.description, item.category, item.brand, item.presentation, item.unit]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLocaleLowerCase("es-DO");
}

export function clampSaleQuantity(requested, available) {
  const stock = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
  if (stock === 0) return 0;
  const quantity = Number.isFinite(requested) ? Math.floor(requested) : 1;
  return Math.min(stock, Math.max(1, quantity));
}

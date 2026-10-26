type CatalogSearchFields = {
  name?: string | null;
  sku?: string | null;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  presentation?: string | null;
  unit?: string | null;
};

export function getBarcodeProductDetails(item: CatalogSearchFields): string;
export function getCatalogSearchText(item: CatalogSearchFields): string;
export function normalizeCatalogValue(value: unknown): string;
export function resolveCatalogCategory(value: string, categories: string[]): string;
export function getCatalogCategories(items: CatalogSearchFields[]): string[];
export function parseCatalogMoney(raw: string): number | null;
export function parseCatalogAttributes(raw: string): {
  value: Record<string, unknown> | null;
  error: string | null;
};
export function clampSaleQuantity(requested: number, available: number): number;

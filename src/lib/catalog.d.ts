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
export function clampSaleQuantity(requested: number, available: number): number;

export declare const TAX_CLASSIFICATION_VALUES: readonly ["gravado", "exento", "pendiente"];
export declare function setProductTaxClassification(
  itemId: string,
  taxClassification: "gravado" | "exento" | "pendiente",
): Promise<unknown>;

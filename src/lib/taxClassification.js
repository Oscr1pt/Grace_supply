import { supabase } from "./supabase";
import { persistenceFailure } from "./persistence.js";

export const TAX_CLASSIFICATION_VALUES = Object.freeze(["gravado", "exento", "pendiente"]);

export async function setProductTaxClassification(itemId, taxClassification) {
  if (!TAX_CLASSIFICATION_VALUES.includes(taxClassification)) {
    throw new Error("Clasificación tributaria inválida.");
  }
  const { data, error } = await supabase.rpc("set_product_tax_classification", {
    p_request: { item_id: itemId, tax_classification: taxClassification },
  });
  if (error) throw persistenceFailure(error);
  return data;
}

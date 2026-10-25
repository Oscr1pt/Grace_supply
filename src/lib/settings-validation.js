export function validateBusinessSettings({
  businessName,
  businessAddress,
  businessPhone,
  taxRate,
}) {
  const errors = {};
  const name = String(businessName ?? "").trim();
  const address = String(businessAddress ?? "").trim();
  const phone = String(businessPhone ?? "").trim();
  const taxText = String(taxRate ?? "").trim();

  if (!name) errors.businessName = "Escribe el nombre del negocio.";
  else if (name.length > 120) errors.businessName = "Usa un nombre de hasta 120 caracteres.";

  if (address.length > 240) errors.businessAddress = "Usa una dirección de hasta 240 caracteres.";

  if (
    phone &&
    (!/^[+\d\s().-]+$/.test(phone) ||
      (phone.match(/\d/g) ?? []).length < 7 ||
      (phone.match(/\d/g) ?? []).length > 15 ||
      phone.length > 30)
  ) {
    errors.businessPhone = "Escribe un teléfono válido con entre 7 y 15 dígitos.";
  }

  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(taxText)) {
    errors.taxRate = "Escribe una tasa numérica entre 0 y 100.";
  } else {
    const rate = Number(taxText);
    if (
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100 ||
      (taxText.split(".")[1]?.length ?? 0) > 2
    ) {
      errors.taxRate = "Usa un número entre 0 y 100 con hasta dos decimales.";
    }
  }

  return errors;
}

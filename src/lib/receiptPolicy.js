export const receiptPolicyCopy = Object.freeze({
  thanks: "¡GRACIAS POR SU COMPRA!",
  title: "POLÍTICA DE CAMBIOS Y DEVOLUCIONES",
  paragraphs: Object.freeze([
    "No realizamos devoluciones de dinero por cambios de opinión.",
    "Los cambios por otros productos pueden solicitarse dentro de los 15 días posteriores a la compra, presentando el recibo y el producto en buen estado.",
    "Verifique sus productos antes de retirarse del establecimiento.",
    "Esta política no limita las garantías ni los derechos del consumidor establecidos por la ley.",
  ]),
});

function parseUtcInstant(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) return null;

  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  const milliseconds = (match[2] ?? "").padEnd(3, "0");
  const canonicalUtc = `${match[1]}.${milliseconds}Z`;
  return new Date(instant).toISOString() === canonicalUtc ? instant : null;
}

export function isReceiptPolicyApplicable(saleCreatedAt, effectiveAt) {
  if (typeof saleCreatedAt !== "string") return false;
  const saleInstant = Date.parse(saleCreatedAt);
  const effectiveInstant = parseUtcInstant(effectiveAt);
  return (
    Number.isFinite(saleInstant) && effectiveInstant !== null && saleInstant >= effectiveInstant
  );
}

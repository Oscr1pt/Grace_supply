const DOCUMENT_SEPARATORS = /[\s-]/g;

export function normalizeClientDocument(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^[0-9\s-]+$/.test(text)) return null;
  return text.replace(DOCUMENT_SEPARATORS, "");
}

export function clientDocumentKind(value) {
  const normalized = normalizeClientDocument(value);
  if (!normalized) return null;
  if (normalized.length === 11) return "cedula";
  if (normalized.length === 9) return "rnc";
  return null;
}

export function isValidCedula(value) {
  const normalized = normalizeClientDocument(value);
  if (!normalized || normalized.length !== 11 || /^([0-9])\1+$/.test(normalized)) return false;
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const product = Number(normalized[index]) * (index % 2 === 0 ? 1 : 2);
    sum += product > 9 ? product - 9 : product;
  }
  return (10 - (sum % 10)) % 10 === Number(normalized[10]);
}

export function isValidRnc(value) {
  const normalized = normalizeClientDocument(value);
  if (!normalized || normalized.length !== 9 || /^([0-9])\1+$/.test(normalized)) return false;
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  const sum = weights.reduce(
    (total, weight, index) => total + Number(normalized[index]) * weight,
    0,
  );
  const remainder = sum % 11;
  const check = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return check === Number(normalized[8]);
}

export function isValidClientDocument(value) {
  const kind = clientDocumentKind(value);
  return kind === "cedula" ? isValidCedula(value) : kind === "rnc" ? isValidRnc(value) : false;
}

export function normalizeClientName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-DO");
}

export function normalizeContact(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("es-DO");
}

export function validateClientForm(form) {
  const errors = {};
  const name = String(form?.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const email = String(form?.email ?? "").trim();
  const phone = String(form?.phone ?? "").trim();
  const document = String(form?.rnc ?? "").trim();
  if (!name) errors.name = "Escribe un nombre o razón social.";
  else if (name.length > 160) errors.name = "El nombre no puede superar 160 caracteres.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Escribe un correo válido o deja este campo vacío.";
  }
  if (phone && !/^\+?[0-9().\s-]{7,24}$/.test(phone)) {
    errors.phone = "Escribe un teléfono válido o deja este campo vacío.";
  }
  if (document && !isValidClientDocument(document)) {
    errors.rnc =
      "Escribe una cédula de 11 dígitos o un RNC de 9 dígitos válido; no verifica identidad oficial.";
  }
  return errors;
}

export function findClientDocumentDuplicate(clients, document, editingId) {
  const normalized = normalizeClientDocument(document);
  if (!normalized) return null;
  return (
    clients.find(
      (client) => client.id !== editingId && normalizeClientDocument(client.rnc) === normalized,
    ) ?? null
  );
}

export function findClientNameContactMatches(clients, form, editingId) {
  const name = normalizeClientName(form?.name);
  if (!name) return [];
  const email = normalizeContact(form?.email);
  const phone = normalizeContact(form?.phone);
  return clients.filter((client) => {
    if (client.id === editingId || normalizeClientName(client.name) !== name) return false;
    return Boolean(
      (email && normalizeContact(client.email) === email) ||
      (phone && normalizeContact(client.phone) === phone),
    );
  });
}

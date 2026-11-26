export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function matchesSearch(fields, query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return true;
  const searchableText = normalizeSearchText(fields.filter(Boolean).join(" "));
  return searchableText.includes(normalizedQuery);
}

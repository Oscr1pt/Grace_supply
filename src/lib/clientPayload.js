const CLIENT_EDITABLE_FIELDS = [
  "name",
  "email",
  "phone",
  "phoneSecondary",
  "rnc",
  "province",
  "city",
  "address",
  "notes",
  "status",
];

export function pickClientMutationFields(value, { includeId = true } = {}) {
  const result = {};
  if (includeId && Object.hasOwn(value, "id")) result.id = value.id;
  for (const field of CLIENT_EDITABLE_FIELDS) {
    if (Object.hasOwn(value, field)) result[field] = value[field];
  }
  return result;
}

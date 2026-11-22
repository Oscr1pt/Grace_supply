export type ClientIdentityError = "name" | "email" | "phone" | "rnc";
export function normalizeClientDocument(value: unknown): string | null;
export function clientDocumentKind(value: unknown): "cedula" | "rnc" | null;
export function isValidCedula(value: unknown): boolean;
export function isValidRnc(value: unknown): boolean;
export function isValidClientDocument(value: unknown): boolean;
export function normalizeClientName(value: unknown): string;
export function normalizeContact(value: unknown): string;
export function validateClientForm(
  form: Record<string, unknown>,
): Partial<Record<ClientIdentityError, string>>;
export function findClientDocumentDuplicate<T extends { id: string; rnc?: string | null }>(
  clients: T[],
  document: unknown,
  editingId?: string,
): T | null;
export function findClientNameContactMatches<
  T extends { id: string; name: string; email?: string | null; phone?: string | null },
>(clients: T[], form: Record<string, unknown>, editingId?: string): T[];

export type PersistenceErrorKind =
  | "denied"
  | "validation"
  | "not_found"
  | "conflict"
  | "transport"
  | "uncertain"
  | "service";

export class PersistenceError extends Error {
  readonly kind: PersistenceErrorKind;
  readonly confirmedIds: string[];
  constructor(kind: PersistenceErrorKind, message: string, confirmedIds?: string[]);
}

export function persistenceFailure(reason: unknown, writeMayHaveReachedServer?: boolean): PersistenceError;
export type MutationIdentity = { id: string } | { key: string; value: string };
export function confirmMutation<T extends { id: string }>(
  result: unknown,
  expected: MutationIdentity,
): Promise<T>;
export function confirmRows<T extends { id: string }>(result: unknown, expectedCount: number): Promise<T[]>;
export function executeAndReconcile<T extends object>(
  write: () => unknown,
  readByIdentity: () => unknown,
  expected: MutationIdentity,
): Promise<T>;
export function commitMutation<T extends { id: string }>(
  result: unknown,
  expected: MutationIdentity,
  commit: (row: T) => void,
): Promise<T>;
export function serializeMutation<T>(key: string, mutation: () => Promise<T>): Promise<T>;
export function createRequestGuard(): {
  begin(): number;
  isCurrent(request: number): boolean;
};
export function getReadFailures(): Array<{ table: string; message: string }>;
export function setReadFailure(table: string, message: string | null): void;
export function subscribeReadFailures(
  listener: (failures: Array<{ table: string; message: string }>) => void,
): () => void;
export function userPersistenceMessage(error: unknown): string;

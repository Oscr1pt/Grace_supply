/** @typedef {"denied" | "validation" | "not_found" | "conflict" | "transport" | "uncertain" | "service"} PersistenceErrorKind */

export class PersistenceError extends Error {
  /** @param {PersistenceErrorKind} kind @param {string} message @param {string[]} [confirmedIds] */
  constructor(kind, message, confirmedIds = []) {
    super(message);
    this.name = "PersistenceError";
    this.kind = kind;
    this.confirmedIds = confirmedIds;
  }
}

/** @param {unknown} reason @param {boolean} [writeMayHaveReachedServer] */
export function persistenceFailure(reason, writeMayHaveReachedServer = false) {
  if (reason instanceof PersistenceError) return reason;

  const error = reason && typeof reason === "object" ? reason : {};
  const code = "code" in error ? String(error.code) : "";
  const status = "status" in error ? Number(error.status) : undefined;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  if (code === "42501" || status === 401 || status === 403) {
    return new PersistenceError("denied", "La operación no fue autorizada.");
  }
  if (code === "PGRST116" || /0 rows/i.test("details" in error ? String(error.details) : "")) {
    return new PersistenceError("not_found", "No se encontró el registro para confirmar el cambio.");
  }
  if (code === "23505" || code === "23503") {
    return new PersistenceError("conflict", "El cambio entra en conflicto con datos existentes.");
  }
  if (code.startsWith("22") || code.startsWith("23")) {
    return new PersistenceError("validation", "El servicio rechazó los datos. Revísalos e intenta de nuevo.");
  }
  if (writeMayHaveReachedServer) {
    return new PersistenceError("uncertain", "No se pudo confirmar el resultado. Verifica el registro antes de repetir.");
  }
  if (reason instanceof TypeError || status === 0) {
    return new PersistenceError("transport", "No se pudo conectar con el servicio. Los cambios no se guardaron.");
  }
  return new PersistenceError("service", "El servicio no pudo completar la operación.");
}

/** @param {unknown} result @param {{ id: string } | { key: string, value: string }} expected */
export async function confirmMutation(result, expected) {
  let response;
  try {
    response = await result;
  } catch (error) {
    throw persistenceFailure(error, true);
  }

  if (!response || typeof response !== "object") {
    throw new PersistenceError("uncertain", "El servicio no devolvió confirmación de persistencia.");
  }
  if ("error" in response && response.error) throw persistenceFailure(response.error, true);

  const data = "data" in response ? response.data : null;
  const rows = Array.isArray(data) ? data : data == null ? [] : [data];
  if (rows.length === 0) {
    throw new PersistenceError("not_found", "La operación no afectó ningún registro y no fue confirmada.");
  }
  if (rows.length !== 1) {
    throw new PersistenceError("conflict", "La operación afectó una cantidad inesperada de registros.");
  }

  const row = rows[0];
  const key = "key" in expected ? expected.key : "id";
  const value = "key" in expected ? expected.value : expected.id;
  if (!row || typeof row !== "object" || row[key] !== value) {
    throw new PersistenceError("uncertain", "La respuesta no coincide con el registro esperado.");
  }
  return row;
}

/** @param {unknown} result @param {number} expectedCount */
export async function confirmRows(result, expectedCount) {
  let response;
  try {
    response = await result;
  } catch (error) {
    throw persistenceFailure(error, true);
  }
  if (!response || typeof response !== "object") {
    throw new PersistenceError("uncertain", "El servicio no devolvió confirmación de persistencia.");
  }
  if ("error" in response && response.error) throw persistenceFailure(response.error, true);
  const data = "data" in response ? response.data : null;
  const rows = Array.isArray(data) ? data : data == null ? [] : [data];
  if (rows.length !== expectedCount) {
    throw rows.length === 0
      ? new PersistenceError("not_found", "La operación no afectó ningún registro y no fue confirmada.")
      : new PersistenceError("conflict", "La operación afectó una cantidad inesperada de registros.");
  }
  const ids = rows.map((row) => row && typeof row === "object" ? row.id : null);
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== expectedCount) {
    throw new PersistenceError("uncertain", "La respuesta no contiene identificadores únicos para todos los registros.");
  }
  return rows;
}

/** @param {() => unknown} write @param {() => unknown} readByIdentity @param {{ id: string } | { key: string, value: string }} expected */
export async function executeAndReconcile(write, readByIdentity, expected) {
  try {
    return await confirmMutation(await write(), expected);
  } catch (error) {
    const failure = persistenceFailure(error, true);
    if (failure.kind !== "uncertain" && failure.kind !== "conflict" && failure.kind !== "not_found") throw failure;
    try {
      return await confirmMutation(await readByIdentity(), expected);
    } catch {
      throw failure;
    }
  }
}

/** @param {unknown} result @param {{ id: string }} expected @param {(row: any) => void} commit */
export async function commitMutation(result, expected, commit) {
  const row = await confirmMutation(result, expected);
  commit(row);
  return row;
}

const mutationQueues = new Map();
const readFailures = new Map();
const readFailureListeners = new Set();

/** @template T @param {string} key @param {() => Promise<T>} mutation */
export function serializeMutation(key, mutation) {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(mutation);
  const tail = current.then(() => undefined, () => undefined);
  mutationQueues.set(key, tail);
  void tail.then(() => {
    if (mutationQueues.get(key) === tail) mutationQueues.delete(key);
  });
  return current;
}

export function createRequestGuard() {
  let revision = 0;
  return {
    begin() {
      revision += 1;
      return revision;
    },
    isCurrent(request) {
      return request === revision;
    },
  };
}

export function getReadFailures() {
  return [...readFailures].map(([table, message]) => ({ table, message }));
}

export function setReadFailure(table, message) {
  if (message) readFailures.set(table, message);
  else readFailures.delete(table);
  for (const listener of readFailureListeners) listener(getReadFailures());
}

export function subscribeReadFailures(listener) {
  readFailureListeners.add(listener);
  return () => readFailureListeners.delete(listener);
}

/** @param {unknown} error */
export function userPersistenceMessage(error) {
  if (error instanceof PersistenceError) return error.message;
  return "No se pudo guardar. Conserva los datos y vuelve a intentarlo.";
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  commitMutation,
  confirmMutation,
  confirmRows,
  createRequestGuard,
  PersistenceError,
  persistenceFailure,
  getReadFailures,
  setReadFailure,
  serializeMutation,
} from "../src/lib/persistence.js";

test("rejects Supabase permission errors as denied", async () => {
  await assert.rejects(
    confirmMutation({ data: null, error: { code: "42501", message: "permission denied" } }, { id: "row-1" }),
    (error) => error instanceof PersistenceError && error.kind === "denied",
  );
});

test("keeps SQL failures distinct from network transport failures", () => {
  const sql = persistenceFailure({ code: "42P01", message: "relation missing" });
  const network = persistenceFailure(new TypeError("Failed to fetch"));
  assert.equal(sql.kind, "service");
  assert.equal(network.kind, "transport");
  assert.notEqual(sql.message, "relation missing");
});

test("treats a lost write response as uncertain", async () => {
  await assert.rejects(
    confirmMutation(Promise.reject(new TypeError("Failed to fetch")), { id: "row-1" }),
    (error) => error instanceof PersistenceError && error.kind === "uncertain",
  );
});

test("rejects updates that affect zero rows", async () => {
  await assert.rejects(
    confirmMutation({ data: [], error: null }, { id: "row-1" }),
    (error) => error instanceof PersistenceError && error.kind === "not_found",
  );
});

test("confirms exactly one matching persisted row", async () => {
  const row = { id: "row-1", name: "Saved" };
  assert.equal(await confirmMutation({ data: [row], error: null }, { id: "row-1" }), row);
});

test("rejects multiple affected rows", async () => {
  await assert.rejects(
    confirmMutation({ data: [{ id: "row-1" }, { id: "row-2" }], error: null }, { id: "row-1" }),
    (error) => error instanceof PersistenceError && error.kind === "conflict",
  );
});

test("confirms a bulk write only when the expected rows and IDs return", async () => {
  const rows = [{ id: "line-1" }, { id: "line-2" }];
  assert.deepEqual(await confirmRows({ data: rows, error: null }, 2), rows);
});

test("does not change confirmed state when persistence fails", async () => {
  let committed = false;
  await assert.rejects(
    commitMutation({ data: null, error: { code: "08006", message: "connection lost" } }, { id: "row-1" }, () => {
      committed = true;
    }),
  );
  assert.equal(committed, false);
});

test("commits only after the remote response arrives", async () => {
  let release;
  let committed = false;
  const response = new Promise((resolve) => { release = resolve; });
  const save = commitMutation(response, { id: "row-1" }, () => { committed = true; });

  await Promise.resolve();
  assert.equal(committed, false);
  release({ data: { id: "row-1" }, error: null });
  await save;
  assert.equal(committed, true);
});

test("serializes writes to the same record to preserve response order", async () => {
  const events = [];
  let release;
  let markStarted;
  const firstGate = new Promise((resolve) => { release = resolve; });
  const firstStarted = new Promise((resolve) => { markStarted = resolve; });
  const first = serializeMutation("inventory:item-1", async () => {
    events.push("first-start");
    markStarted();
    await firstGate;
    events.push("first-end");
  });
  const second = serializeMutation("inventory:item-1", async () => {
    events.push("second-start");
  });

  await firstStarted;
  assert.deepEqual(events, ["first-start"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first-start", "first-end", "second-start"]);
});

test("prevents an older read response from replacing newer data", () => {
  const guard = createRequestGuard();
  const olderRead = guard.begin();
  const newerRead = guard.begin();
  assert.equal(guard.isCurrent(newerRead), true);
  assert.equal(guard.isCurrent(olderRead), false);
});

test("tracks a failed read as stale and clears the warning after a confirmed read", () => {
  setReadFailure("clients", "No se pudo actualizar la lectura.");
  assert.deepEqual(getReadFailures(), [{ table: "clients", message: "No se pudo actualizar la lectura." }]);
  setReadFailure("clients", null);
  assert.deepEqual(getReadFailures(), []);
});

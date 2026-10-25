import test from "node:test";
import assert from "node:assert/strict";
import { commitMutation, executeAndReconcile, PersistenceError } from "../src/lib/persistence.js";

function createRemoteFixture(failure = null) {
  const rows = new Map();
  let writes = 0;

  return {
    async write(row) {
      writes += 1;
      if (failure === "rls") return { data: null, error: { code: "42501", message: "permission denied" } };
      if (failure === "sql") return { data: null, error: { code: "42P01", message: "relation missing" } };
      if (failure === "disconnect") throw new TypeError("Failed to fetch");
      rows.set(row.id, structuredClone(row));
      if (failure === "timeout-after-commit") throw new TypeError("response timed out");
      return { data: [structuredClone(rows.get(row.id))], error: null };
    },
    async authorizedRead(id) {
      return structuredClone(rows.get(id) ?? null);
    },
    get writeCount() {
      return writes;
    },
  };
}

test("confirmed fixture write matches a subsequent authorized read", async () => {
  const remote = createRemoteFixture();
  const entity = { id: "fixture-1", name: "Synthetic" };
  const confirmed = await commitMutation(remote.write(entity), { id: entity.id }, () => {});
  assert.deepEqual(await remote.authorizedRead(entity.id), confirmed);
});

test("RLS and SQL failures never run the confirmed-state callback", async () => {
  for (const failure of ["rls", "sql"]) {
    const remote = createRemoteFixture(failure);
    let announced = false;
    await assert.rejects(
      commitMutation(remote.write({ id: failure }), { id: failure }, () => { announced = true; }),
      PersistenceError,
    );
    assert.equal(announced, false);
    assert.equal(await remote.authorizedRead(failure), null);
  }
});

test("disconnect and timeout after commit are uncertain and are never retried", async () => {
  for (const failure of ["disconnect", "timeout-after-commit"]) {
    const remote = createRemoteFixture(failure);
    let announced = false;
    await assert.rejects(
      commitMutation(remote.write({ id: failure }), { id: failure }, () => { announced = true; }),
      (error) => error instanceof PersistenceError && error.kind === "uncertain",
    );
    assert.equal(remote.writeCount, 1);
    assert.equal(announced, false);
  }
});

test("reconciles a timeout by reading the same stable ID before deciding", async () => {
  const remote = createRemoteFixture("timeout-after-commit");
  const row = await executeAndReconcile(
    () => remote.write({ id: "stable-timeout-id", name: "Synthetic" }),
    async () => ({ data: await remote.authorizedRead("stable-timeout-id"), error: null }),
    { id: "stable-timeout-id" },
  );
  assert.equal(row.id, "stable-timeout-id");
  assert.equal(remote.writeCount, 1);
});

test("keeps a timeout uncertain when the stable-ID read cannot confirm it", async () => {
  const remote = createRemoteFixture("disconnect");
  await assert.rejects(
    executeAndReconcile(
      () => remote.write({ id: "missing-id" }),
      () => remote.authorizedRead("missing-id").then((data) => ({ data, error: null })),
      { id: "missing-id" },
    ),
    (error) => error instanceof PersistenceError && error.kind === "uncertain",
  );
  assert.equal(remote.writeCount, 1);
});

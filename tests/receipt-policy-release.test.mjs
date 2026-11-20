import test from "node:test";
import assert from "node:assert/strict";

let release;
try {
  release = await import("../scripts/receipt-policy-release.mjs");
} catch {
  // Keep the red phase explicit until the release-policy source exists.
}

const historicalCutoff = "2026-11-18T03:18:00.000Z";

test("later releases use the fixed historical receipt-policy cutoff without requiring it to be future", () => {
  assert.equal(release.RECEIPT_POLICY_RELEASE.effectiveAt, historicalCutoff);
  assert.deepEqual(
    release.resolveReceiptPolicyRelease({ now: Date.parse("2026-11-20T00:00:00.000Z") }),
    { mode: "established", effectiveAt: historicalCutoff },
  );
});

test("initial policy activation requires an explicit flag and a future versioned cutoff", () => {
  const now = Date.parse("2026-11-18T02:00:00.000Z");
  const pendingActivation = { effectiveAt: historicalCutoff, activationRequired: true };
  assert.deepEqual(
    release.resolveReceiptPolicyRelease({ release: pendingActivation, activate: true, now }),
    { mode: "activation", effectiveAt: historicalCutoff },
  );
  assert.throws(
    () =>
      release.resolveReceiptPolicyRelease({
        release: pendingActivation,
        activate: true,
        now: Date.parse("2026-11-19T00:00:00.000Z"),
      }),
    /future/,
  );
  assert.throws(
    () => release.resolveReceiptPolicyRelease({ release: pendingActivation, now }),
    /Explicit initial/,
  );
});

test("a later release cannot override the historical cutoff with an operator value", () => {
  assert.throws(
    () => release.resolveReceiptPolicyRelease({ cutoff: "2026-11-19T03:18:00.000Z" }),
    /versioned release source/,
  );
  assert.throws(
    () =>
      release.resolveReceiptPolicyRelease({
        release: { effectiveAt: "", activationRequired: false },
      }),
    /valid versioned UTC cutoff/,
  );
  assert.throws(
    () =>
      release.resolveReceiptPolicyRelease({
        release: { effectiveAt: "invalid", activationRequired: false },
      }),
    /valid versioned UTC cutoff/,
  );
});

test("established policy releases reject activation mode and initial activation rejects established state", () => {
  assert.throws(
    () => release.resolveReceiptPolicyRelease({ activate: true }),
    /No initial receipt-policy activation is pending/,
  );
});

export const RECEIPT_POLICY_RELEASE = Object.freeze({
  effectiveAt: "2026-11-18T03:18:00.000Z",
  activationRequired: false,
});

function validUtcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function resolveReceiptPolicyRelease(options = {}) {
  const unsupportedOverride = ["cutoff", "effectiveAt", "approvedCutoff"].find((key) =>
    Object.hasOwn(options, key),
  );
  if (unsupportedOverride) {
    throw new Error(
      "Receipt-policy cutoffs must come from the versioned release source, not operator overrides.",
    );
  }
  const release = options.release ?? RECEIPT_POLICY_RELEASE;
  const activate = options.activate ?? false;
  const now = options.now ?? Date.now();
  if (!release || typeof release !== "object" || !validUtcTimestamp(release.effectiveAt)) {
    throw new Error("Receipt policy release must contain a valid versioned UTC cutoff.");
  }
  if (typeof release.activationRequired !== "boolean") {
    throw new Error("Receipt policy release must declare whether initial activation is pending.");
  }
  if (release.activationRequired && !activate) {
    throw new Error(
      "Explicit initial receipt-policy activation is required for this versioned cutoff.",
    );
  }
  if (!release.activationRequired && activate) {
    throw new Error("No initial receipt-policy activation is pending.");
  }
  if (release.activationRequired && Date.parse(release.effectiveAt) <= now) {
    throw new Error("Initial receipt-policy activation cutoff must be in the future.");
  }
  return {
    mode: release.activationRequired ? "activation" : "established",
    effectiveAt: release.effectiveAt,
  };
}

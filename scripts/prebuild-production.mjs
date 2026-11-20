import { getApprovedPublicKey, validateProductionConfig } from "./production-build-guard.mjs";
import { resolveReceiptPolicyRelease } from "./receipt-policy-release.mjs";

try {
  const key = getApprovedPublicKey();
  const config = validateProductionConfig(process.env, key);
  const release = resolveReceiptPolicyRelease({
    activate: process.env.GRACE_ACTIVATE_RECEIPT_POLICY === "true",
  });
  if (config.receiptPolicyEffectiveAt !== release.effectiveAt) {
    throw new Error("Production build cutoff differs from the versioned receipt-policy release.");
  }
  console.log(
    "Production build preflight passed (approved Supabase project/key and release settings).",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

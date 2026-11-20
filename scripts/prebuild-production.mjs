import {
  getApprovedPublicKey,
  isFutureUtcReceiptCutoff,
  validateProductionConfig,
} from "./production-build-guard.mjs";

try {
  const key = getApprovedPublicKey();
  const config = validateProductionConfig(process.env, key);
  if (!isFutureUtcReceiptCutoff(config.receiptPolicyEffectiveAt)) {
    throw new Error(
      "Production build configuration rejected: receipt-policy cutoff is no longer in the future.",
    );
  }
  console.log(
    "Production build preflight passed (approved Supabase project/key and release settings).",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import path from "node:path";
import {
  getApprovedPublicKey,
  isFutureUtcReceiptCutoff,
  validateProductionConfig,
  verifyProductionBundle,
} from "./production-build-guard.mjs";

try {
  const key = getApprovedPublicKey();
  const expected = validateProductionConfig(process.env, key);
  if (!isFutureUtcReceiptCutoff(expected.receiptPolicyEffectiveAt)) {
    throw new Error(
      "Production build configuration rejected: receipt-policy cutoff expired during the build.",
    );
  }
  const result = verifyProductionBundle(path.resolve(".output"), expected);
  console.log(
    `Production bundle verified: ${result.authChunk} uses the approved Supabase client configuration.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import path from "node:path";
import {
  getApprovedPublicKey,
  validateProductionConfig,
  verifyProductionBundle,
} from "./production-build-guard.mjs";
import { resolveReceiptPolicyRelease } from "./receipt-policy-release.mjs";

try {
  const key = getApprovedPublicKey();
  const expected = validateProductionConfig(process.env, key);
  const release = resolveReceiptPolicyRelease({
    activate: process.env.GRACE_ACTIVATE_RECEIPT_POLICY === "true",
  });
  if (expected.receiptPolicyEffectiveAt !== release.effectiveAt) {
    throw new Error("Production bundle cutoff differs from the versioned receipt-policy release.");
  }
  const result = verifyProductionBundle(path.resolve(".output"), expected);
  console.log(
    `Production bundle verified: ${result.authChunk} uses the approved Supabase client configuration.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

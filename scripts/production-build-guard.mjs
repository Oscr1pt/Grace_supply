import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const GRACE_PROJECT_REF = "qazjfofpfcwopcefupjl";
export const GRACE_SUPABASE_URL = `https://${GRACE_PROJECT_REF}.supabase.co`;
export const SUPABASE_CLI_VERSION = "2.121.0";

function fail(message) {
  throw new Error(`Production build configuration rejected: ${message}`);
}

function keyRoleFromJwt(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function isValidPublishableKey(value) {
  return /^sb_publishable_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/.test(value);
}

function isValidLegacyAnonKey(value) {
  return keyRoleFromJwt(value) === "anon";
}

function requireNoWhitespace(value, name) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /\s/.test(value)
  ) {
    fail(`${name} is missing or contains whitespace.`);
  }
}

export function isValidUtcReceiptCutoff(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function isFutureUtcReceiptCutoff(value, now = Date.now()) {
  return isValidUtcReceiptCutoff(value) && Date.parse(value) > now;
}

export function selectApprovedPublicKey(cliJson, { allowLegacy = false } = {}) {
  let payload;
  try {
    payload = typeof cliJson === "string" ? JSON.parse(cliJson) : cliJson;
  } catch {
    fail("Supabase CLI returned unreadable API-key data.");
  }
  const entries = Array.isArray(payload) ? payload : (payload?.api_keys ?? payload?.keys);
  if (!Array.isArray(entries)) fail("Supabase CLI did not return an API-key list.");

  const enabled = entries.filter((entry) => entry && entry.disabled !== true);
  const publishable = enabled.filter((entry) => entry.type === "publishable");
  if (publishable.length === 1) {
    const selected = publishable[0];
    if (typeof selected.api_key !== "string" || !isValidPublishableKey(selected.api_key)) {
      fail("The active publishable key returned by Supabase CLI is not valid.");
    }
    return { type: "publishable", api_key: selected.api_key };
  }
  if (publishable.length > 1) fail("Supabase CLI returned multiple active publishable keys.");

  if (allowLegacy) {
    const legacyAnon = enabled.filter((entry) => entry.type === "legacy" && entry.name === "anon");
    if (
      legacyAnon.length === 1 &&
      typeof legacyAnon[0].api_key === "string" &&
      isValidLegacyAnonKey(legacyAnon[0].api_key)
    ) {
      return { type: "legacy", api_key: legacyAnon[0].api_key };
    }
  }
  fail("No single approved active publishable key is available for this project.");
}

export function getApprovedPublicKey({ cwd = process.cwd(), allowLegacy = false } = {}) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli)
    fail("Run the production guard through npm so the pinned CLI can be invoked safely.");
  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [
        npmCli,
        "exec",
        "--offline",
        "--yes",
        `--package=supabase@${SUPABASE_CLI_VERSION}`,
        "--",
        "supabase",
        "projects",
        "api-keys",
        "--project-ref",
        GRACE_PROJECT_REF,
        "--output",
        "json",
      ],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  } catch {
    fail(`Supabase CLI ${SUPABASE_CLI_VERSION} could not verify the approved project key.`);
  }
  return selectApprovedPublicKey(stdout, { allowLegacy });
}

export function validateProductionConfig(env, trustedKey) {
  if (!env || typeof env !== "object") fail("Build environment is unavailable.");
  if (env.VITE_SUPABASE_URL !== GRACE_SUPABASE_URL) {
    fail("VITE_SUPABASE_URL does not match the approved production project.");
  }
  const parsedUrl = new URL(env.VITE_SUPABASE_URL);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== `${GRACE_PROJECT_REF}.supabase.co` ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    fail("VITE_SUPABASE_URL is not the exact approved HTTPS project endpoint.");
  }

  const allowLegacy = env.GRACE_ALLOW_LEGACY_ANON_KEY === "true";
  if (!trustedKey || trustedKey.disabled === true || typeof trustedKey.api_key !== "string") {
    fail("The trusted Supabase key source is unavailable or disabled.");
  }
  requireNoWhitespace(trustedKey.api_key, "Trusted Supabase key");
  if (
    trustedKey.type === "secret" ||
    trustedKey.type === "service_role" ||
    /^sb_secret_/.test(trustedKey.api_key)
  ) {
    fail("Privileged Supabase keys are never allowed in a browser build.");
  }
  if (trustedKey.type === "publishable") {
    if (!isValidPublishableKey(trustedKey.api_key))
      fail("The trusted publishable key has an invalid format.");
  } else if (trustedKey.type === "legacy") {
    if (!allowLegacy || !isValidLegacyAnonKey(trustedKey.api_key)) {
      fail("Legacy keys require explicit approval and an anon-role JWT.");
    }
  } else {
    fail("The trusted key source did not identify a public key type.");
  }

  const actualKey = env.VITE_SUPABASE_ANON_KEY;
  requireNoWhitespace(actualKey, "VITE_SUPABASE_ANON_KEY");
  if (/^sb_secret_/.test(actualKey) || keyRoleFromJwt(actualKey) === "service_role") {
    fail("Privileged Supabase keys are never allowed in a browser build.");
  }
  if (actualKey !== trustedKey.api_key) {
    fail(
      "VITE_SUPABASE_ANON_KEY does not exactly match the active public key for the approved project.",
    );
  }

  for (const [urlName, keyName] of [
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  ]) {
    if (env[urlName] && env[urlName] !== GRACE_SUPABASE_URL) {
      fail(`${urlName} conflicts with the approved production project.`);
    }
    if (env[keyName] && env[keyName] !== trustedKey.api_key) {
      fail(`${keyName} conflicts with the approved public key.`);
    }
  }

  if (env.VITE_ACCOUNT_PROVISIONING_ENABLED !== "true") {
    fail("VITE_ACCOUNT_PROVISIONING_ENABLED must be true.");
  }
  if (env.VITE_ACCOUNT_RECOVERY_ENABLED !== "false") {
    fail("VITE_ACCOUNT_RECOVERY_ENABLED must be false.");
  }
  const cutoff = env.VITE_RECEIPT_POLICY_EFFECTIVE_AT;
  if (!isValidUtcReceiptCutoff(cutoff)) {
    fail("VITE_RECEIPT_POLICY_EFFECTIVE_AT must be an exact valid UTC timestamp ending in Z.");
  }
  if (env.GRACE_APPROVED_RECEIPT_POLICY_EFFECTIVE_AT !== cutoff) {
    fail("The receipt-policy cutoff does not match the explicitly approved release cutoff.");
  }

  return {
    projectRef: GRACE_PROJECT_REF,
    url: GRACE_SUPABASE_URL,
    approvedKey: trustedKey.api_key,
    keyType: trustedKey.type,
    accountProvisioningEnabled: true,
    accountRecoveryEnabled: false,
    receiptPolicyEffectiveAt: cutoff,
  };
}

export function validateCompiledBrowserRuntimeConfig(config, expected) {
  if (!config || typeof config !== "object") {
    throw new Error("Production bundle rejected: compiled runtime configuration is unavailable.");
  }
  if (config.url !== expected.url || config.key !== expected.approvedKey) {
    throw new Error(
      "Production bundle rejected: compiled Supabase client settings differ from the approved project configuration.",
    );
  }
  if (/^sb_secret_/.test(config.key) || keyRoleFromJwt(config.key) === "service_role") {
    throw new Error("Production bundle rejected: compiled runtime contains a privileged key.");
  }
  return true;
}

export function inspectNoPrivilegedCredentials(text) {
  if (/\bsb_secret_[A-Za-z0-9_-]{30,}\b/.test(text)) {
    throw new Error(
      "Production bundle rejected: a privileged Supabase key is present in browser assets.",
    );
  }
  const tokens = text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
  if (tokens.some((token) => keyRoleFromJwt(token) === "service_role")) {
    throw new Error(
      "Production bundle rejected: a legacy service-role JWT is present in browser assets.",
    );
  }
  return true;
}

function propertyValues(text, property) {
  const pattern = new RegExp("\\b" + property + "\\s*:\\s*`([^`]*)`", "g");
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function requireConsistentProperty(text, property) {
  const values = propertyValues(text, property);
  if (values.length === 0 || values.some((value) => value !== values[0])) {
    throw new Error(
      `Production bundle rejected: the effective ${property} values in the Supabase client chunk are missing or inconsistent.`,
    );
  }
  return values[0];
}

export function inspectProductionBundleText(bundleText, expected) {
  if (typeof bundleText !== "string" || !bundleText || !expected?.approvedKey) {
    throw new Error(
      "Production bundle rejected: client bundle or trusted configuration is unavailable.",
    );
  }
  if (/\bsb_secret_[A-Za-z0-9_-]{30,}\b/.test(bundleText)) {
    throw new Error("Production bundle rejected: a privileged Supabase key is present.");
  }
  const tokenMatches =
    bundleText.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
  if (tokenMatches.some((token) => keyRoleFromJwt(token) === "service_role")) {
    throw new Error("Production bundle rejected: a legacy service-role JWT is present.");
  }
  const hosts = [...new Set(bundleText.match(/https:\/\/[a-z0-9-]+\.supabase\.co/gi) ?? [])];
  if (hosts.length !== 1 || hosts[0] !== expected.url) {
    throw new Error(
      "Production bundle rejected: Supabase project URLs are missing or inconsistent.",
    );
  }

  const actual = {
    url: requireConsistentProperty(bundleText, "VITE_SUPABASE_URL"),
    key: requireConsistentProperty(bundleText, "VITE_SUPABASE_ANON_KEY"),
    provisioning: requireConsistentProperty(bundleText, "VITE_ACCOUNT_PROVISIONING_ENABLED"),
    recovery: requireConsistentProperty(bundleText, "VITE_ACCOUNT_RECOVERY_ENABLED"),
    cutoff: requireConsistentProperty(bundleText, "VITE_RECEIPT_POLICY_EFFECTIVE_AT"),
  };
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(actual.url)) {
    throw new Error("Production bundle rejected: the effective Supabase client endpoint is local.");
  }
  if (actual.url !== expected.url)
    throw new Error(
      "Production bundle rejected: the client Supabase URL differs from the approved project.",
    );
  if (actual.key !== expected.approvedKey)
    throw new Error(
      "Production bundle rejected: the effective client API key differs from the active approved key.",
    );
  if (actual.provisioning !== "true" || expected.accountProvisioningEnabled !== true) {
    throw new Error("Production bundle rejected: account provisioning flag is incorrect.");
  }
  if (actual.recovery !== "false" || expected.accountRecoveryEnabled !== false) {
    throw new Error("Production bundle rejected: account recovery flag is incorrect.");
  }
  if (
    actual.cutoff !== expected.receiptPolicyEffectiveAt ||
    !isValidUtcReceiptCutoff(actual.cutoff)
  ) {
    throw new Error(
      "Production bundle rejected: receipt-policy cutoff differs from the approved UTC release value.",
    );
  }
  return { clientConfigVerified: true, projectRef: GRACE_PROJECT_REF };
}

export function verifyProductionBundle(outputDirectory, expected) {
  const publicDirectory = path.join(outputDirectory, "public");
  const textExtensions = new Set([".js", ".css", ".html", ".json", ".map", ".txt", ".xml", ".svg"]);
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push({ name: entry.name, contents: readFileSync(fullPath, "utf8") });
      }
    }
  }
  walk(publicDirectory);
  const jsFiles = files.filter(({ name }) => name.endsWith(".js"));
  const clientChunks = jsFiles.filter(({ name }) => /^auth-[A-Za-z0-9_-]+\.js$/.test(name));
  if (clientChunks.length !== 1) {
    throw new Error("Production bundle rejected: expected exactly one compiled auth client chunk.");
  }
  for (const file of files) inspectNoPrivilegedCredentials(file.contents);
  inspectProductionBundleText(clientChunks[0].contents, expected);
  return {
    clientConfigVerified: true,
    authChunk: clientChunks[0].name,
    projectRef: GRACE_PROJECT_REF,
  };
}

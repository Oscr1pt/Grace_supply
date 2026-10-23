import { createClient } from "npm:@supabase/supabase-js@2";
import { json, normalizeUsername } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const enabled = Deno.env.get("ACCOUNT_RECOVERY_ENABLED") === "true";
const probeEmail = "account-recovery-probe@invalid.gracesupply.local";
const genericMessage = "Si la cuenta estÃ¡ habilitada y tiene un correo individual verificado, recibirÃ¡ instrucciones.";
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const auth = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function redirectUrl() {
  const configuredOrigin = Deno.env.get("APP_PUBLIC_ORIGIN") ?? "http://127.0.0.1:3000";
  const url = new URL(configuredOrigin);
  const allowedOrigins = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(Deno.env.get("APP_ALLOWED_ORIGINS") ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  ]);
  if (!allowedOrigins.has(url.origin)) throw new Error("Recovery redirect origin is not allow-listed");
  return new URL("/reset-password", url.origin).toString();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json(request, 204, {});
  if (request.method !== "POST") return json(request, 405, { error: "MÃ©todo no permitido" });
  if (!enabled) return json(request, 503, { error: "La recuperaciÃ³n no estÃ¡ habilitada." });

  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(request, 400, { error: "Solicitud invÃ¡lida" });
  }
  const username = normalizeUsername(body.username);
  if (!username) return json(request, 400, { error: "Solicitud invÃ¡lida" });

  let email = probeEmail;
  try {
    const { data: profile, error: profileError } = await service
      .from("user_profiles")
      .select("auth_user_id, active")
      .eq("normalized_username", username)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.active) {
      const { data: identity, error: identityError } = await service.auth.admin.getUserById(profile.auth_user_id);
      if (identityError) throw identityError;
      const candidate = identity.user?.email;
      if (candidate && identity.user.email_confirmed_at) email = candidate;
    }
    const url = redirectUrl();
    const { error: recoveryError } = await auth.auth.resetPasswordForEmail(email, { redirectTo: url });
    if (recoveryError) console.error("Auth recovery request could not be completed");
  } catch {
    // Return the same response for unknown users, inactive profiles and backend failures.
    console.error("Auth recovery request could not be completed");
    try {
      await auth.auth.resetPasswordForEmail(probeEmail, { redirectTo: redirectUrl() });
    } catch {
      // Do not expose identity lookup or delivery state to the requester.
    }
  }
  return json(request, 202, { message: genericMessage });
});

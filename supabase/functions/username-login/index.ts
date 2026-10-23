import { createClient } from "npm:@supabase/supabase-js@2";
import { json, normalizeUsername } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const auth = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const genericFailure = { error: "Usuario o contraseña inválidos" };
const rateLimitProbeEmail = "rate-limit-probe@invalid.gracesupply.local";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json(request, 204, {});
  if (request.method !== "POST") return json(request, 405, { error: "Método no permitido" });

  let input: { username?: unknown; password?: unknown };
  try {
    input = await request.json();
  } catch {
    return json(request, 400, { error: "Solicitud inválida" });
  }

  const username = normalizeUsername(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  if (!username || password.length < 1 || password.length > 1024) {
    await auth.auth.signInWithPassword({ email: rateLimitProbeEmail, password: password || "invalid" });
    return json(request, 401, genericFailure);
  }

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("auth_user_id, active")
    .eq("normalized_username", username)
    .maybeSingle();
  if (profileError) return json(request, 503, { error: "El servicio de inicio de sesión no está disponible" });

  if (!profile?.active) {
    await auth.auth.signInWithPassword({ email: rateLimitProbeEmail, password });
    return json(request, 401, genericFailure);
  }

  const { data: authRecord, error: authLookupError } = await admin.auth.admin.getUserById(profile.auth_user_id);
  if (authLookupError) return json(request, 503, { error: "El servicio de inicio de sesión no está disponible" });
  const email = authRecord.user?.email;
  if (!email || !authRecord.user.email_confirmed_at) {
    await auth.auth.signInWithPassword({ email: rateLimitProbeEmail, password });
    return json(request, 401, genericFailure);
  }

  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) return json(request, 401, genericFailure);
  return json(request, 200, { session: data.session });
});

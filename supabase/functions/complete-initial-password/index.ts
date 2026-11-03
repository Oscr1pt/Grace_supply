import { createClient } from "npm:@supabase/supabase-js@2";
import { json } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json(request, 204, {});
  if (request.method !== "POST") return json(request, 405, { error: "MÃ©todo no permitido" });

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(request, 401, { error: "SesiÃ³n no vÃ¡lida" });

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: identity, error: identityError } = await caller.auth.getUser(token);
  if (identityError || !identity.user?.email_confirmed_at) {
    return json(request, 401, {
      error: "La identidad debe confirmar su correo antes de configurar la cuenta.",
    });
  }

  let input: { password?: unknown };
  try {
    input = await request.json();
  } catch {
    return json(request, 400, { error: "Solicitud invÃ¡lida" });
  }
  const password = typeof input.password === "string" ? input.password : "";
  if (password.length < 12)
    return json(request, 400, { error: "La contraseÃ±a debe tener al menos 12 caracteres." });

  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("auth_user_id,active,password_change_required")
    .eq("auth_user_id", identity.user.id)
    .maybeSingle();
  if (profileError)
    return json(request, 503, { error: "No se pudo verificar la configuraciÃ³n de la cuenta." });
  if (!profile)
    return json(request, 403, {
      error: "No existe una configuraciÃ³n inicial pendiente para esta identidad.",
    });
  if (profile.active)
    return json(request, 409, {
      error:
        "La cuenta ya estÃ¡ activa. Solicita recuperaciÃ³n si necesitas cambiar la contraseÃ±a.",
    });
  if (!profile.password_change_required) return json(request, 200, { completed: true });

  const changed = await service.auth.admin.updateUserById(identity.user.id, { password });
  if (changed.error)
    return json(request, 400, {
      error: "No se pudo actualizar la contraseÃ±a. Intenta nuevamente.",
    });

  const completed = await service
    .from("user_profiles")
    .update({ password_change_required: false })
    .eq("auth_user_id", identity.user.id)
    .eq("active", false)
    .eq("password_change_required", true)
    .select("auth_user_id")
    .maybeSingle();
  if (completed.error || !completed.data) {
    return json(request, 503, {
      error:
        "La contraseÃ±a se actualizÃ³, pero el servidor no pudo confirmar la finalizaciÃ³n. Reintenta para conciliar el resultado.",
    });
  }

  return json(request, 200, { completed: true });
});

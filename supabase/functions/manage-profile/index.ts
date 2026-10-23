import { createClient } from "npm:@supabase/supabase-js@2";
import { json, normalizeUsername } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const provisioningEnabled = Deno.env.get("ACCOUNT_PROVISIONING_ENABLED") === "true";
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isLocalTestRuntime() {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname)
      || (hostname === "kong" && Deno.env.get("CHG04_LOCAL_TEST_MODE") === "true");
  } catch {
    return false;
  }
}

function localFaultEnabled(name: string) {
  return isLocalTestRuntime() && Deno.env.get(name) === "true";
}

function inviteRedirectUrl() {
  const configuredOrigin = Deno.env.get("APP_PUBLIC_ORIGIN") ?? "http://127.0.0.1:3000";
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = new Set([
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
    ...configured,
  ]);
  const origin = new URL(configuredOrigin).origin;
  if (!allowedOrigins.has(origin)) throw new Error("Redirect origin is not allow-listed");
  return new URL("/reset-password", origin).toString();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json(request, 204, {});
  if (request.method !== "POST") return json(request, 405, { error: "Método no permitido" });

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(request, 401, { error: "Sesión no válida" });

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: identity, error: identityError } = await caller.auth.getUser(token);
  if (identityError || !identity.user?.email_confirmed_at) return json(request, 401, { error: "Sesión no válida" });

  const { data: actor, error: actorError } = await service
    .from("user_profiles")
    .select("role, active")
    .eq("auth_user_id", identity.user.id)
    .maybeSingle();
  if (actorError) return json(request, 503, { error: "No se pudo verificar la autorización" });
  if (!actor?.active || actor.role !== "admin") return json(request, 403, { error: "Operación no autorizada" });

  let input: {
    action?: unknown;
    username?: unknown;
    email?: unknown;
    name?: unknown;
    role?: unknown;
    permissions?: unknown;
    incident_id?: unknown;
  };
  try {
    input = await request.json();
  } catch {
    return json(request, 400, { error: "Solicitud inválida" });
  }

  const username = normalizeUsername(input.username);
  if (!username || !["update", "revoke", "invite_employee", "activate", "resolve_provisioning_incident"].includes(String(input.action))) {
    return json(request, 400, { error: "Solicitud inválida" });
  }

  if (input.action === "invite_employee") {
    if (!provisioningEnabled) return json(request, 503, { error: "Employee provisioning is disabled pending verified Cloud email and redirect configuration." });
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 120) {
      return json(request, 400, { error: "Solicitud invÃ¡lida" });
    }
    const { data: existing, error: existingError } = await service
      .from("user_profiles")
      .select("auth_user_id")
      .eq("normalized_username", username)
      .maybeSingle();
    if (existingError) return json(request, 503, { error: "No se pudo verificar el perfil" });
    if (existing) return json(request, 409, { error: "El nombre de usuario ya estÃ¡ ocupado." });

    let redirectTo: string;
    try { redirectTo = inviteRedirectUrl(); }
    catch { return json(request, 503, { error: "El servicio de invitaciÃ³n no estÃ¡ configurado." }); }
    const { data: invitation, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteError || !invitation.user) return json(request, 409, { error: "No se pudo crear la invitaciÃ³n." });
    const allowedPermissions = ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"];
    const permissions = Array.isArray(input.permissions)
      ? [...new Set(input.permissions.filter((permission) => typeof permission === "string" && allowedPermissions.includes(permission)))]
      : ["sales"];
    const { data: pendingProfile, error: profileError } = await service.from("user_profiles").insert({
      auth_user_id: invitation.user.id,
      username: username.trim(),
      name,
      role: "employee",
      // Local-only fault injection uses the real PostgreSQL CHECK constraint at the write boundary.
      permissions: localFaultEnabled("CHG04_LOCAL_TEST_FAIL_PROFILE_INSERT")
          && (username.startsWith("__chg04_test_fail_profile__") || username.startsWith("__chg04_test_fail_cleanup__"))
        ? ["__controlled_profile_insert_failure__"]
        : permissions,
      active: false,
    }).select("username,name,role,permissions,active").single();
    if (profileError) {
      const injectCleanupTransportFailure = localFaultEnabled("CHG04_LOCAL_TEST_FAIL_AUTH_CLEANUP")
        && username.startsWith("__chg04_test_fail_cleanup__");
      const cleanup = injectCleanupTransportFailure
        ? await createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            fetch: async (input, init) => {
              const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
              const method = init?.method ?? (input instanceof Request ? input.method : "GET");
              if (requestUrl.includes("/auth/v1/admin/users/") && method.toUpperCase() === "DELETE") {
                return new Response(JSON.stringify({ message: "Controlled local Auth Admin transport failure" }), {
                  status: 503,
                  headers: { "content-type": "application/json" },
                });
              }
              return fetch(input, init);
            },
          },
        }).auth.admin.deleteUser(invitation.user.id)
        : await service.auth.admin.deleteUser(invitation.user.id);
      if (cleanup.error) {
        const incident = await service.from("provisioning_incidents").insert({
          auth_user_id: invitation.user.id,
          username: username.trim(),
          incident_type: "auth_identity_cleanup_failed",
          details: `Profile persistence failed (${profileError.code ?? "unknown"}); Auth compensation failed.`,
          created_by: identity.user.id,
        }).select("id").single();
        console.error("Employee provisioning compensation failed", {
          incidentId: incident.data?.id,
          incidentWriteError: incident.error?.message,
          authUserId: invitation.user.id,
          username,
          profileError: profileError.message,
          cleanupError: cleanup.error.message,
        });
        return json(request, 503, {
          error: "Profile persistence failed and Auth cleanup needs administrator intervention.",
          incidentId: incident.data?.id,
        });
      }
      return json(request, 503, { error: "The invitation could not be linked to a profile and was cancelled." });
    }
    return json(request, 202, { profile: pendingProfile });
  }

  if (input.action === "resolve_provisioning_incident") {
    const incidentId = typeof input.incident_id === "string" ? input.incident_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(incidentId)) return json(request, 400, { error: "Solicitud inválida" });
    const { data: incident, error: incidentError } = await service.from("provisioning_incidents")
      .select("id,auth_user_id,status")
      .eq("id", incidentId)
      .maybeSingle();
    if (incidentError) return json(request, 503, { error: "No se pudo consultar la incidencia." });
    if (!incident) return json(request, 404, { error: "Incidencia no encontrada." });
    if (incident.status === "open") {
      const deletion = await service.auth.admin.deleteUser(incident.auth_user_id);
      if (deletion.error) return json(request, 503, { error: "La identidad parcial sigue pendiente de limpieza administrativa." });
      const resolved = await service.from("provisioning_incidents").update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: identity.user.id,
      }).eq("id", incident.id).eq("status", "open").select("id,status").maybeSingle();
      if (resolved.error || !resolved.data) return json(request, 503, { error: "La identidad fue eliminada, pero no se pudo cerrar la incidencia." });
    }
    return json(request, 200, { resolved: true });
  }

  if (input.action === "activate") {
    const { data: openIncident, error: openIncidentError } = await service.from("provisioning_incidents")
      .select("id")
      .eq("username", username)
      .eq("status", "open")
      .maybeSingle();
    if (openIncidentError) return json(request, 503, { error: "No se pudo verificar el estado del aprovisionamiento." });
    if (openIncident) return json(request, 423, { error: "La cuenta requiere resolución administrativa antes de activarse." });
  }

  const { data: target, error: targetError } = await service
    .from("user_profiles")
    .select("auth_user_id, username, role, active")
    .eq("normalized_username", username)
    .maybeSingle();
  if (targetError) return json(request, 503, { error: "No se pudo consultar el perfil" });
  if (!target) return json(request, 404, { error: "No se encontró el perfil" });
  if (target.auth_user_id === identity.user.id && input.action === "revoke") {
    return json(request, 409, { error: "No puedes revocar tu propia cuenta desde esta sesión" });
  }

  if (input.action === "revoke") {
    const { data: revoked, error } = await service
      .from("user_profiles")
      .update({ active: false })
      .eq("auth_user_id", target.auth_user_id)
      .select("username, name, role, permissions, active")
      .maybeSingle();
    if (error) return json(request, 409, { error: "No se pudo revocar el perfil" });
    const { error: banError } = await service.auth.admin.updateUserById(target.auth_user_id, { ban_duration: "876000h" });
    if (banError) return json(request, 503, { error: "Acceso revocado en la base; falta invalidar la sesión Auth" });
    return json(request, 200, { profile: revoked });
  }

  if (input.action === "activate") {
    const { data: authTarget, error: authTargetError } = await service.auth.admin.getUserById(target.auth_user_id);
    if (authTargetError) return json(request, 503, { error: "No se pudo verificar el correo de la cuenta." });
    if (!authTarget.user?.email || !authTarget.user.email_confirmed_at) {
      return json(request, 409, { error: "La cuenta no tiene un correo confirmado." });
    }
    const { data: activated, error: activateError } = await service.from("user_profiles")
      .update({ active: true })
      .eq("auth_user_id", target.auth_user_id)
      .select("username,name,role,permissions,active")
      .maybeSingle();
    if (activateError || !activated) return json(request, 409, { error: "No se pudo activar el perfil." });
    return json(request, 200, { profile: activated });
  }

  const update: Record<string, unknown> = {};
  if (typeof input.name === "string" && input.name.trim()) update.name = input.name.trim();
  if (input.role === "admin" || input.role === "employee") {
    if (target.auth_user_id === identity.user.id && input.role !== "admin") {
      return json(request, 409, { error: "No puedes reducir tu propio rol desde esta sesión" });
    }
    update.role = input.role;
    update.permissions = input.role === "admin"
      ? ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"]
      : Array.isArray(input.permissions)
      ? input.permissions.filter((permission) => ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"].includes(permission))
      : ["sales"];
  } else if (Array.isArray(input.permissions)) {
    update.permissions = input.permissions.filter((permission) => ["dashboard", "clients", "suppliers", "inventory", "sales", "purchases", "expenses", "settings"].includes(permission));
  }
  if (!Object.keys(update).length) return json(request, 400, { error: "No hay cambios válidos" });

  const { data: profile, error } = await service
    .from("user_profiles")
    .update(update)
    .eq("auth_user_id", target.auth_user_id)
    .select("username, name, role, permissions, active")
    .maybeSingle();
  if (error) return json(request, 409, { error: "No se pudo actualizar el perfil" });
  if (!profile) return json(request, 404, { error: "No se encontró el perfil" });
  return json(request, 200, { profile });
});

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
    return (
      ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
      (hostname === "kong" && Deno.env.get("CHG04_LOCAL_TEST_MODE") === "true")
    );
  } catch {
    return false;
  }
}

function localFaultEnabled(name: string) {
  return isLocalTestRuntime() && Deno.env.get(name) === "true";
}

function inviteRedirectUrl(path = "/setup-account") {
  const configuredOrigin = Deno.env.get("APP_PUBLIC_ORIGIN") ?? "http://127.0.0.1:3000";
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    ...configured,
  ]);
  const origin = new URL(configuredOrigin).origin;
  if (!allowedOrigins.has(origin)) throw new Error("Redirect origin is not allow-listed");
  return new URL(path, origin).toString();
}

function provisioningPrerequisites(): { ok: true } | { ok: false; reason: string } {
  if (!provisioningEnabled) {
    return { ok: false, reason: "Las invitaciones no están habilitadas en este entorno." };
  }
  try {
    const configuredOrigin = Deno.env.get("APP_PUBLIC_ORIGIN")?.trim();
    const localRuntime = isLocalTestRuntime();
    if (!configuredOrigin && !localRuntime) {
      return { ok: false, reason: "El origen público no está configurado para este entorno." };
    }
    const origin = new URL(configuredOrigin ?? "http://127.0.0.1:3000").origin;
    const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const localOrigin = new Set([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ]);
    if (!localRuntime && !configured.includes(origin)) {
      return {
        ok: false,
        reason: "El origen público no está autorizado para enviar invitaciones.",
      };
    }
    if (localRuntime && !localOrigin.has(origin) && !configured.includes(origin)) {
      return { ok: false, reason: "El origen local no está autorizado para enviar invitaciones." };
    }
    inviteRedirectUrl("/setup-account");
  } catch {
    return { ok: false, reason: "Las URL de redirección no están configuradas para este entorno." };
  }
  return { ok: true };
}

function validPhone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const phone = value.trim();
  const digits = phone.match(/\d/g)?.length ?? 0;
  return phone.length <= 30 && /^[+\d\s().-]+$/.test(phone) && digits >= 7 && digits <= 15;
}

async function authEmailAlreadyExists(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const pageSize = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;
    const users = data.users ?? [];
    if (users.some((user) => user.email?.trim().toLowerCase() === normalizedEmail)) return true;
    if (users.length < pageSize) return false;
  }
}

async function compensateCreatedIdentity(authUserId: string, username: string, actorId: string) {
  const injectedFailure =
    localFaultEnabled("CHG04_LOCAL_TEST_FAIL_AUTH_CLEANUP") &&
    username.startsWith("__chg04_test_fail_cleanup__");
  const cleanup = injectedFailure
    ? await createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          fetch: async (input, init) => {
            const requestUrl =
              typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const method = init?.method ?? (input instanceof Request ? input.method : "GET");
            if (requestUrl.includes("/auth/v1/admin/users/") && method.toUpperCase() === "DELETE") {
              return new Response(
                JSON.stringify({ message: "Controlled local Auth Admin transport failure" }),
                {
                  status: 503,
                  headers: { "content-type": "application/json" },
                },
              );
            }
            return fetch(input, init);
          },
        },
      }).auth.admin.deleteUser(authUserId)
    : await service.auth.admin.deleteUser(authUserId);
  if (!cleanup.error) return null;

  const incident = await service
    .from("provisioning_incidents")
    .insert({
      auth_user_id: authUserId,
      username,
      incident_type: "auth_identity_cleanup_failed",
      details: "Administrative user creation failed and Auth compensation failed.",
      created_by: actorId,
    })
    .select("id")
    .single();
  return incident.data?.id ?? "recording-failed";
}

async function hasProfileForIdentity(authUserId: string) {
  const { data, error } = await service
    .from("user_profiles")
    .select("auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

function ephemeralPassword() {
  // Keep the server-only credential below GoTrue's 72-character limit.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `Ephemeral-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}-Aa1!`;
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
  if (identityError || !identity.user?.email_confirmed_at)
    return json(request, 401, { error: "Sesión no válida" });

  const { data: actor, error: actorError } = await service
    .from("user_profiles")
    .select("role, active")
    .eq("auth_user_id", identity.user.id)
    .maybeSingle();
  if (actorError) return json(request, 503, { error: "No se pudo verificar la autorización" });
  if (!actor?.active || actor.role !== "admin")
    return json(request, 403, { error: "Operación no autorizada" });

  let input: {
    action?: unknown;
    username?: unknown;
    email?: unknown;
    name?: unknown;
    phone?: unknown;
    role?: unknown;
    permissions?: unknown;
    confirm_admin_creation?: unknown;
    incident_id?: unknown;
  };
  try {
    input = await request.json();
  } catch {
    return json(request, 400, { error: "Solicitud inválida" });
  }

  const username = normalizeUsername(input.username);
  if (input.action === "invite_employee") {
    return json(request, 410, {
      error:
        "El flujo de invitación automática fue retirado. Usa Crear usuario para generar un enlace privado.",
    });
  }
  if (
    !username ||
    !["create_user", "update", "revoke", "activate", "resolve_provisioning_incident"].includes(
      String(input.action),
    )
  ) {
    return json(request, 400, { error: "Solicitud inválida" });
  }

  if (input.action === "create_user") {
    const prerequisites = provisioningPrerequisites();
    if (!prerequisites.ok)
      return json(request, 503, {
        error: prerequisites.reason,
      });
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    const role = input.role === "admin" || input.role === "employee" ? input.role : null;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !name ||
      name.length > 120 ||
      !validPhone(phone) ||
      !role
    ) {
      return json(request, 400, {
        error: "Revisa el nombre, usuario, correo, teléfono y rol.",
      });
    }
    if (role === "admin" && input.confirm_admin_creation !== true) {
      return json(request, 409, {
        error: "Confirma explícitamente la creación de una cuenta administradora.",
      });
    }
    const { data: existing, error: existingError } = await service
      .from("user_profiles")
      .select("auth_user_id")
      .eq("normalized_username", username)
      .maybeSingle();
    if (existingError)
      return json(request, 503, { error: "No se pudo verificar la disponibilidad del usuario." });
    if (existing) return json(request, 409, { error: "El nombre de usuario ya está ocupado." });
    try {
      if (await authEmailAlreadyExists(email))
        return json(request, 409, { error: "El correo ya está asociado a una cuenta." });
    } catch {
      return json(request, 503, { error: "No se pudo verificar la disponibilidad del correo." });
    }
    const { data: openIncident, error: incidentError } = await service
      .from("provisioning_incidents")
      .select("id")
      .eq("username", username)
      .eq("status", "open")
      .maybeSingle();
    if (incidentError)
      return json(request, 503, { error: "No se pudo verificar el estado del aprovisionamiento." });
    if (openIncident)
      return json(request, 423, {
        error: "La cuenta requiere revisión administrativa antes de intentar otra vez.",
      });

    let redirectTo: string;
    try {
      redirectTo = inviteRedirectUrl("/setup-account");
    } catch {
      return json(request, 503, { error: "El servicio de invitación no está configurado." });
    }
    const { data: createdIdentity, error: createError } = await service.auth.admin.createUser({
      email,
      password: ephemeralPassword(),
      email_confirm: false,
    });
    if (createError || !createdIdentity.user)
      return json(request, 409, {
        error: "No se pudo completar el alta. Verifica los datos de la cuenta.",
      });
    const { data: generated, error: linkError } = await service.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    const setupUrl = generated?.properties?.action_link;
    if (linkError || !setupUrl) {
      const incidentId = await compensateCreatedIdentity(
        createdIdentity.user.id,
        username,
        identity.user.id,
      );
      return json(request, incidentId ? 503 : 409, {
        error: incidentId
          ? "La cuenta requiere revisión administrativa antes de activarse."
          : "No se pudo generar el enlace seguro y la identidad fue cancelada.",
        ...(incidentId ? { incidentId } : {}),
      });
    }
    try {
      if (await hasProfileForIdentity(createdIdentity.user.id))
        return json(request, 409, { error: "El correo ya está asociado a una cuenta." });
    } catch {
      return json(request, 503, { error: "No se pudo verificar la identidad de la cuenta." });
    }

    const allPermissions = [
      "dashboard",
      "clients",
      "suppliers",
      "inventory",
      "sales",
      "purchases",
      "expenses",
      "settings",
    ];
    const requestedPermissions = Array.isArray(input.permissions)
      ? [
          ...new Set(
            input.permissions.filter(
              (permission) => typeof permission === "string" && allPermissions.includes(permission),
            ),
          ),
        ]
      : ["sales"];
    const permissions = role === "admin" ? allPermissions : requestedPermissions;
    const insertPermissions =
      localFaultEnabled("CHG04_LOCAL_TEST_FAIL_PROFILE_INSERT") &&
      (username.startsWith("__chg04_test_fail_profile__") ||
        username.startsWith("__chg04_test_fail_cleanup__"))
        ? ["__controlled_profile_insert_failure__"]
        : permissions;
    const { data: profile, error: profileError } = await service
      .from("user_profiles")
      .insert({
        auth_user_id: createdIdentity.user.id,
        username: username.trim(),
        name,
        phone,
        role,
        permissions: insertPermissions,
        active: false,
        password_change_required: true,
      })
      .select("username,name,phone,role,permissions,active,password_change_required")
      .single();
    if (profileError) {
      const incidentId = await compensateCreatedIdentity(
        createdIdentity.user.id,
        username,
        identity.user.id,
      );
      return json(request, incidentId ? 503 : 409, {
        error: incidentId
          ? "El perfil no se guardó y la identidad requiere revisión administrativa."
          : "El perfil no se guardó y la identidad fue cancelada.",
        ...(incidentId ? { incidentId } : {}),
      });
    }
    return json(request, 202, { profile, setup_url: setupUrl });
  }

  if (input.action === "invite_employee") {
    const prerequisites = provisioningPrerequisites();
    if (!prerequisites.ok)
      return json(request, 503, {
        error: prerequisites.reason,
      });
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 120) {
      return json(request, 400, { error: "Solicitud inválida" });
    }
    const { data: existing, error: existingError } = await service
      .from("user_profiles")
      .select("auth_user_id")
      .eq("normalized_username", username)
      .maybeSingle();
    if (existingError) return json(request, 503, { error: "No se pudo verificar el perfil" });
    if (existing) return json(request, 409, { error: "El nombre de usuario ya está ocupado." });

    let redirectTo: string;
    try {
      redirectTo = inviteRedirectUrl();
    } catch {
      return json(request, 503, { error: "El servicio de invitación no está configurado." });
    }
    const { data: invitation, error: inviteError } = await service.auth.admin.inviteUserByEmail(
      email,
      { redirectTo },
    );
    if (inviteError || !invitation.user)
      return json(request, 409, { error: "No se pudo crear la invitación." });
    const allowedPermissions = [
      "dashboard",
      "clients",
      "suppliers",
      "inventory",
      "sales",
      "purchases",
      "expenses",
      "settings",
    ];
    const permissions = Array.isArray(input.permissions)
      ? [
          ...new Set(
            input.permissions.filter(
              (permission) =>
                typeof permission === "string" && allowedPermissions.includes(permission),
            ),
          ),
        ]
      : ["sales"];
    const { data: pendingProfile, error: profileError } = await service
      .from("user_profiles")
      .insert({
        auth_user_id: invitation.user.id,
        username: username.trim(),
        name,
        role: "employee",
        // Local-only fault injection uses the real PostgreSQL CHECK constraint at the write boundary.
        permissions:
          localFaultEnabled("CHG04_LOCAL_TEST_FAIL_PROFILE_INSERT") &&
          (username.startsWith("__chg04_test_fail_profile__") ||
            username.startsWith("__chg04_test_fail_cleanup__"))
            ? ["__controlled_profile_insert_failure__"]
            : permissions,
        active: false,
      })
      .select("username,name,role,permissions,active,password_change_required")
      .single();
    if (profileError) {
      const injectCleanupTransportFailure =
        localFaultEnabled("CHG04_LOCAL_TEST_FAIL_AUTH_CLEANUP") &&
        username.startsWith("__chg04_test_fail_cleanup__");
      const cleanup = injectCleanupTransportFailure
        ? await createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
            global: {
              fetch: async (input, init) => {
                const requestUrl =
                  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
                const method = init?.method ?? (input instanceof Request ? input.method : "GET");
                if (
                  requestUrl.includes("/auth/v1/admin/users/") &&
                  method.toUpperCase() === "DELETE"
                ) {
                  return new Response(
                    JSON.stringify({ message: "Controlled local Auth Admin transport failure" }),
                    {
                      status: 503,
                      headers: { "content-type": "application/json" },
                    },
                  );
                }
                return fetch(input, init);
              },
            },
          }).auth.admin.deleteUser(invitation.user.id)
        : await service.auth.admin.deleteUser(invitation.user.id);
      if (cleanup.error) {
        const incident = await service
          .from("provisioning_incidents")
          .insert({
            auth_user_id: invitation.user.id,
            username: username.trim(),
            incident_type: "auth_identity_cleanup_failed",
            details: `Profile persistence failed (${profileError.code ?? "unknown"}); Auth compensation failed.`,
            created_by: identity.user.id,
          })
          .select("id")
          .single();
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
      return json(request, 503, {
        error: "The invitation could not be linked to a profile and was cancelled.",
      });
    }
    return json(request, 202, { profile: pendingProfile });
  }

  if (input.action === "resolve_provisioning_incident") {
    const incidentId = typeof input.incident_id === "string" ? input.incident_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(incidentId))
      return json(request, 400, { error: "Solicitud inválida" });
    const { data: incident, error: incidentError } = await service
      .from("provisioning_incidents")
      .select("id,auth_user_id,status")
      .eq("id", incidentId)
      .maybeSingle();
    if (incidentError) return json(request, 503, { error: "No se pudo consultar la incidencia." });
    if (!incident) return json(request, 404, { error: "Incidencia no encontrada." });
    if (incident.status === "open") {
      const deletion = await service.auth.admin.deleteUser(incident.auth_user_id);
      if (deletion.error)
        return json(request, 503, {
          error: "La identidad parcial sigue pendiente de limpieza administrativa.",
        });
      const resolved = await service
        .from("provisioning_incidents")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: identity.user.id,
        })
        .eq("id", incident.id)
        .eq("status", "open")
        .select("id,status")
        .maybeSingle();
      if (resolved.error || !resolved.data)
        return json(request, 503, {
          error: "La identidad fue eliminada, pero no se pudo cerrar la incidencia.",
        });
    }
    return json(request, 200, { resolved: true });
  }

  if (input.action === "activate") {
    const { data: openIncident, error: openIncidentError } = await service
      .from("provisioning_incidents")
      .select("id")
      .eq("username", username)
      .eq("status", "open")
      .maybeSingle();
    if (openIncidentError)
      return json(request, 503, { error: "No se pudo verificar el estado del aprovisionamiento." });
    if (openIncident)
      return json(request, 423, {
        error: "La cuenta requiere resolución administrativa antes de activarse.",
      });
  }

  const { data: target, error: targetError } = await service
    .from("user_profiles")
    .select("auth_user_id, username, role, active, password_change_required")
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
      .select("username, name, phone, role, permissions, active, password_change_required")
      .maybeSingle();
    if (error) return json(request, 409, { error: "No se pudo revocar el perfil" });
    const { error: banError } = await service.auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: "876000h",
    });
    if (banError)
      return json(request, 503, {
        error: "Acceso revocado en la base; falta invalidar la sesión Auth",
      });
    return json(request, 200, { profile: revoked });
  }

  if (input.action === "activate") {
    if (target.password_change_required) {
      return json(request, 409, {
        error: "La persona debe establecer su contraseña personal antes de activar el acceso.",
      });
    }
    const { data: authTarget, error: authTargetError } = await service.auth.admin.getUserById(
      target.auth_user_id,
    );
    if (authTargetError)
      return json(request, 503, { error: "No se pudo verificar el correo de la cuenta." });
    if (!authTarget.user?.email || !authTarget.user.email_confirmed_at) {
      return json(request, 409, { error: "La cuenta no tiene un correo confirmado." });
    }
    const { data: activated, error: activateError } = await service
      .from("user_profiles")
      .update({ active: true })
      .eq("auth_user_id", target.auth_user_id)
      .select("username,name,phone,role,permissions,active,password_change_required")
      .maybeSingle();
    if (activateError || !activated)
      return json(request, 409, { error: "No se pudo activar el perfil." });
    return json(request, 200, { profile: activated });
  }

  const update: Record<string, unknown> = {};
  if (Object.hasOwn(input, "name")) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 120)
      return json(request, 400, { error: "Escribe un nombre de hasta 120 caracteres." });
    update.name = name;
  }
  if (Object.hasOwn(input, "phone")) {
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    if (phone && !validPhone(phone))
      return json(request, 400, { error: "Escribe un teléfono válido con entre 7 y 15 dígitos." });
    update.phone = phone || null;
  }
  if (input.role === "admin" || input.role === "employee") {
    if (target.auth_user_id === identity.user.id && input.role !== target.role) {
      return json(request, 409, { error: "No puedes cambiar tu propio rol desde esta sesión." });
    }
    if (input.role === "admin" && input.confirm_admin_role !== true) {
      return json(request, 409, {
        error: "Confirma explícitamente la asignación del rol administrador.",
      });
    }
    if (target.auth_user_id === identity.user.id && input.role !== "admin") {
      return json(request, 409, { error: "No puedes reducir tu propio rol desde esta sesión" });
    }
    update.role = input.role;
    update.permissions =
      input.role === "admin"
        ? [
            "dashboard",
            "clients",
            "suppliers",
            "inventory",
            "sales",
            "purchases",
            "expenses",
            "settings",
          ]
        : Array.isArray(input.permissions)
          ? input.permissions.filter((permission) =>
              [
                "dashboard",
                "clients",
                "suppliers",
                "inventory",
                "sales",
                "purchases",
                "expenses",
                "settings",
              ].includes(permission),
            )
          : ["sales"];
  } else if (Array.isArray(input.permissions)) {
    update.permissions = input.permissions.filter((permission) =>
      [
        "dashboard",
        "clients",
        "suppliers",
        "inventory",
        "sales",
        "purchases",
        "expenses",
        "settings",
      ].includes(permission),
    );
  }
  if (!Object.keys(update).length) return json(request, 400, { error: "No hay cambios válidos" });

  const { data: profile, error } = await service
    .from("user_profiles")
    .update(update)
    .eq("auth_user_id", target.auth_user_id)
    .select("username, name, phone, role, permissions, active, password_change_required")
    .maybeSingle();
  if (error) return json(request, 409, { error: "No se pudo actualizar el perfil" });
  if (!profile) return json(request, 404, { error: "No se encontró el perfil" });
  return json(request, 200, { profile });
});

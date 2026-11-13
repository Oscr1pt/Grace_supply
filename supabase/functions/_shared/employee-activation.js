export async function activateProfile(service, target) {
  if (target.password_change_required) {
    return {
      status: 409,
      body: {
        error: "La persona debe establecer su contraseña personal antes de activar el acceso.",
      },
    };
  }

  let authTarget;
  try {
    const response = await service.auth.admin.getUserById(target.auth_user_id);
    if (response.error || !response.data?.user) {
      return { status: 503, body: { error: "No se pudo verificar la identidad de la cuenta." } };
    }
    authTarget = response.data.user;
  } catch {
    return { status: 503, body: { error: "No se pudo verificar la identidad de la cuenta." } };
  }

  if (!authTarget.email || !authTarget.email_confirmed_at) {
    return { status: 409, body: { error: "La cuenta no tiene un correo confirmado." } };
  }

  let unblocked = false;
  try {
    const { data, error } = await service.auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: "none",
    });
    unblocked = !error && data?.user?.id === target.auth_user_id;
  } catch {
    unblocked = false;
  }

  if (!unblocked) {
    try {
      const { error } = await service
        .from("user_profiles")
        .update({ active: false })
        .eq("auth_user_id", target.auth_user_id);
      if (error) {
        return {
          status: 503,
          body: {
            error:
              "No se pudo confirmar el desbloqueo y el perfil no pudo quedar inactivo; requiere revisión administrativa.",
          },
        };
      }
    } catch {
      return {
        status: 503,
        body: {
          error:
            "No se pudo confirmar el desbloqueo y el perfil no pudo quedar inactivo; requiere revisión administrativa.",
        },
      };
    }
    return {
      status: 503,
      body: { error: "No se pudo desbloquear la identidad Auth; el perfil quedó inactivo." },
    };
  }

  let activationFailed = false;
  try {
    const { data, error } = await service
      .from("user_profiles")
      .update({ active: true })
      .eq("auth_user_id", target.auth_user_id)
      .select("username,name,phone,role,permissions,active,password_change_required")
      .maybeSingle();
    if (error || !data) activationFailed = true;
    else return { status: 200, body: { profile: data } };
  } catch {
    activationFailed = true;
  }

  let banRestored = false;
  try {
    const { data, error } = await service.auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: "876000h",
    });
    banRestored = !error && data?.user?.id === target.auth_user_id;
  } catch {
    banRestored = false;
  }

  let profileInactive = false;
  try {
    const { error } = await service
      .from("user_profiles")
      .update({ active: false })
      .eq("auth_user_id", target.auth_user_id);
    profileInactive = !error;
  } catch {
    profileInactive = false;
  }

  if (!banRestored || !profileInactive) {
    return {
      status: 503,
      body: {
        error:
          "No se pudo confirmar la activación ni restaurar el bloqueo; requiere revisión administrativa.",
      },
    };
  }

  return {
    status: 409,
    body: { error: "No se pudo activar el perfil; la cuenta se mantuvo bloqueada e inactiva." },
  };
}

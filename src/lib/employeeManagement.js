const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d\s().-]+$/;

/** @param {unknown} active @param {unknown} passwordChangeRequired @param {unknown} emailConfirmed */
export function getEmployeeAccountStatus(
  active,
  passwordChangeRequired = false,
  emailConfirmed = null,
) {
  if (active === true) {
    return { label: "Cuenta activa", description: "El acceso está habilitado.", tone: "active" };
  }
  if (passwordChangeRequired === true) {
    return {
      label: "Activación pendiente",
      description: "La persona debe establecer su contraseña personal antes de activar el acceso.",
      tone: "inactive",
    };
  }
  if (emailConfirmed === false) {
    return {
      label: "Pendiente de correo",
      description: "La cuenta permanece inactiva hasta confirmar el correo.",
      tone: "inactive",
    };
  }
  return {
    label: "Cuenta inactiva",
    description: "El correo se verifica en el servidor antes de activar el acceso.",
    tone: "inactive",
  };
}

/** @param {{ username?: unknown, name?: unknown, email?: unknown }} input */
export function validateEmployeeInvitation(input) {
  const errors = {};
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";

  if (!username) errors.username = "Escribe un nombre de usuario.";
  else if (!USERNAME_PATTERN.test(username))
    errors.username = "Usa entre 3 y 64 letras, números, puntos, guiones o guiones bajos.";
  if (!name) errors.name = "Escribe el nombre de la persona.";
  else if (name.length > 120) errors.name = "El nombre no puede superar 120 caracteres.";
  if (!email) errors.email = "Escribe el correo individual de la persona.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Escribe un correo válido.";

  return errors;
}

/** @param {{ username?: unknown, name?: unknown, email?: unknown, phone?: unknown, role?: unknown, initialPassword?: unknown, confirmPassword?: unknown }} input */
export function validateEmployeeCreation(input) {
  const errors = validateEmployeeInvitation(input);
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const initialPassword = typeof input.initialPassword === "string" ? input.initialPassword : "";
  const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";

  if (!phone) errors.phone = "Escribe el teléfono de la persona.";
  else if (
    !PHONE_PATTERN.test(phone) ||
    (phone.match(/\d/g) ?? []).length < 7 ||
    (phone.match(/\d/g) ?? []).length > 15 ||
    phone.length > 30
  ) {
    errors.phone = "Escribe un teléfono válido con entre 7 y 15 dígitos.";
  }
  if (input.role !== "admin" && input.role !== "employee") {
    errors.role = "Selecciona un rol válido.";
  }
  if (initialPassword.length < 12) {
    errors.initialPassword = "La contraseña inicial debe tener al menos 12 caracteres.";
  }
  if (initialPassword !== confirmPassword) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }
  return errors;
}

/** @param {unknown} result @param {string} username @param {{active?: boolean, name?: string, phone?: string | null, role?: string, permissions?: string[]}} [expected] */
export function requireConfirmedEmployeeProfile(result, username, expected = {}) {
  const profile =
    result && typeof result === "object" && "profile" in result ? result.profile : null;
  if (
    !profile ||
    typeof profile !== "object" ||
    typeof profile.username !== "string" ||
    profile.username.toLowerCase() !== username.trim().toLowerCase() ||
    typeof profile.active !== "boolean" ||
    !["admin", "employee"].includes(profile.role) ||
    !Array.isArray(profile.permissions)
  ) {
    throw new Error(
      "El servidor no confirmó el estado de la cuenta. Actualiza la lista antes de repetir.",
    );
  }
  if (Object.hasOwn(expected, "active") && profile.active !== expected.active) {
    throw new Error(
      "El servidor no confirmó el estado solicitado. Actualiza la lista antes de repetir.",
    );
  }
  if (expected.name && profile.name !== expected.name) {
    throw new Error(
      "El servidor no confirmó el nombre solicitado. Actualiza la lista antes de repetir.",
    );
  }
  if (Object.hasOwn(expected, "phone") && profile.phone !== expected.phone) {
    throw new Error(
      "El servidor no confirmó el teléfono solicitado. Actualiza la lista antes de repetir.",
    );
  }
  if (expected.role && profile.role !== expected.role) {
    throw new Error(
      "El servidor no confirmó el rol solicitado. Actualiza la lista antes de repetir.",
    );
  }
  if (expected.permissions) {
    const actual = [...profile.permissions].sort();
    const wanted = [...expected.permissions].sort();
    if (
      actual.length !== wanted.length ||
      actual.some((permission, index) => permission !== wanted[index])
    ) {
      throw new Error(
        "El servidor no confirmó los permisos solicitados. Actualiza la lista antes de repetir.",
      );
    }
  }
  return profile;
}

/** @param {unknown} error @param {"invite"|"activate"|"update"|"revoke"} action */
export function employeeActionErrorMessage(error, action) {
  const status =
    error && typeof error === "object" && "context" in error && error.context instanceof Response
      ? error.context.status
      : error && typeof error === "object" && "status" in error
        ? Number(error.status)
        : 0;
  if (status === 401) return "Tu sesión venció. Inicia sesión nuevamente.";
  if (status === 403) return "No tienes permiso para administrar esta cuenta.";
  if (status === 423) return "La cuenta requiere revisión administrativa antes de activarse.";
  if (status === 503 && action === "create")
    return "La creación de cuentas no está habilitada en este entorno.";
  if (status === 503 && action === "invite")
    return "Las invitaciones no están habilitadas en este entorno.";
  if (status === 503 && action === "update")
    return "El servicio no pudo confirmar el cambio. Conserva los datos e inténtalo de nuevo.";
  if (status === 409) {
    if (action === "create")
      return "No se pudo completar el alta. Verifica si la cuenta ya aparece en el listado antes de repetir.";
    if (action === "invite")
      return "No se pudo completar la invitación. Verifica el usuario y el estado de la cuenta.";
    if (action === "activate")
      return "El servidor no pudo confirmar la activación. Verifica el estado de la cuenta.";
    if (action === "revoke")
      return "No se pudo confirmar la revocación. Actualiza el estado antes de repetir.";
    return "No se pudo guardar el cambio. El perfil pudo cambiar en otra sesión.";
  }
  if (error instanceof TypeError || status === 0) {
    return "No se pudo confirmar la respuesta del servidor. Actualiza la lista antes de repetir.";
  }
  return "No se pudo completar el cambio. Conserva los datos e inténtalo de nuevo.";
}

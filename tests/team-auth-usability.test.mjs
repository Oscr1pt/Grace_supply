import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  employeeActionErrorMessage,
  getEmployeeAccountStatus,
  requireConfirmedEmployeeProfile,
  validateEmployeeCreation,
  validateEmployeeInvitation,
} from "../src/lib/employeeManagement.js";

const teamSource = readFileSync(new URL("../src/routes/_app/team.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../src/lib/auth.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../src/routes/login.tsx", import.meta.url), "utf8");
const recoverySource = readFileSync(new URL("../src/routes/recover.tsx", import.meta.url), "utf8");
const resetSource = readFileSync(
  new URL("../src/routes/reset-password.tsx", import.meta.url),
  "utf8",
);
const chg22MigrationName = readdirSync(new URL("../supabase/migrations/", import.meta.url)).find(
  (name) => name.endsWith("_chg22_secure_user_creation_editing.sql"),
);
const chg22Migration = chg22MigrationName
  ? readFileSync(new URL(`../supabase/migrations/${chg22MigrationName}`, import.meta.url), "utf8")
  : "";
const chg22CreatePage = readFileSync(
  new URL("../src/pages/TeamCreateUserPage.tsx", import.meta.url),
  "utf8",
);
const chg22SetupPage = readFileSync(
  new URL("../src/pages/SetupAccountPage.tsx", import.meta.url),
  "utf8",
);
const initialPasswordFunction = readFileSync(
  new URL("../supabase/functions/complete-initial-password/index.ts", import.meta.url),
  "utf8",
);
const runtimeRoutes = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");

test("team management uses a searchable employee table and a details dialog", () => {
  assert.match(teamSource, /<table/);
  assert.match(teamSource, /Buscar empleados/);
  assert.match(teamSource, /Pendientes de configuración/);
  assert.match(teamSource, /DialogContent/);
  assert.match(teamSource, /Guardar cambios/);
  assert.doesNotMatch(teamSource, /Reconciliar acceso/);
});

test("employee access action is contextual and initial-password setup blocks activation", () => {
  assert.match(
    teamSource,
    /employee\.active\s*\?\s*\(\s*<Button[\s\S]*?Revocar acceso[\s\S]*?\)\s*:\s*!activationBlocked\s*\?\s*\(/,
  );
  assert.match(teamSource, /Revocar acceso/);
  assert.match(teamSource, /Activar acceso/);
  assert.doesNotMatch(teamSource, /Reconciliar acceso/);
  assert.match(teamSource, /passwordChangeRequired/);
  assert.match(teamSource, /activateEmployee\(action\.target\.username\)/);
  assert.match(teamSource, /removeEmployee\(action\.target\.username\)/);
});

test("employee details request an admin-assisted recovery link without persistence", () => {
  assert.match(teamSource, /Restablecer contraseña/);
  assert.match(teamSource, /createEmployeeRecoveryLink/);
  assert.match(authSource, /action: "generate_recovery_link"/);
  assert.match(teamSource, /navigator\.clipboard\.writeText/);
  assert.match(teamSource, /recoveryUrl/);
  assert.match(teamSource, /setRecoveryUrl\(null\)/);
  assert.doesNotMatch(teamSource, /localStorage|sessionStorage/);
});
test("employee inactivity is not presented as unconfirmed email", () => {
  assert.doesNotMatch(
    teamSource,
    /Pendiente de correo confirmado/i,
    "inactivity must not be described as unconfirmed mail",
  );
  assert.match(
    teamSource,
    /getEmployeeAccountStatus\(\s*employee\.active,\s*employee\.passwordChangeRequired,\s*employee\.emailConfirmed,?\s*\)/,
    "display state reflects active and initial-password status",
  );
});

test("employee status does not infer email confirmation from inactivity", () => {
  assert.deepEqual(getEmployeeAccountStatus(false), {
    label: "Cuenta inactiva",
    description: "El correo se verifica en el servidor antes de activar el acceso.",
    tone: "inactive",
  });
  assert.equal(getEmployeeAccountStatus(true).label, "Cuenta activa");
  assert.equal(getEmployeeAccountStatus(false, false, null).label, "Cuenta inactiva");
  assert.equal(getEmployeeAccountStatus(false, false, true).label, "Cuenta inactiva");
  assert.equal(getEmployeeAccountStatus(false, false, false).label, "Pendiente de correo");
  assert.equal(getEmployeeAccountStatus(false, true, false).label, "Activaci\u00f3n pendiente");
});

test("employee directory uses the server authorization route for explicit email status", () => {
  assert.match(authSource, /functions\.invoke[\s\S]*?list_employees/);
  assert.doesNotMatch(
    authSource,
    /from\("user_profiles"\)\s*\.select\("username, name, phone, role, permissions, active, password_change_required"\)\s*\.order\("username"\)/,
  );
});

test("employee directory failures distinguish a permission denial from a service failure", () => {
  assert.equal(
    employeeActionErrorMessage({ status: 503 }, "list"),
    "No se pudo cargar la lista de empleados. Intenta actualizarla.",
  );
  assert.equal(
    employeeActionErrorMessage({ status: 403 }, "list"),
    "No tienes permiso para administrar esta cuenta.",
  );
});

test("recovery links are blocked with actionable feedback for revoked employees", () => {
  assert.equal(
    employeeActionErrorMessage({ status: 409 }, "recovery"),
    "La cuenta está revocada o bloqueada. Un administrador debe reactivar el acceso antes de generar un enlace de recuperación.",
  );
});

test("Auth callback distinguishes a banned account from an invalid or expired link", () => {
  assert.match(authSource, /initialAuthCallback\.errorCode === "user_banned"/);
  assert.match(authSource, /cuenta está revocada o bloqueada/i);
  assert.match(resetSource, /passwordSetupError \?\?/);
});

test("invitation validation uses the server's username and name limits", () => {
  assert.deepEqual(validateEmployeeInvitation({ username: "ab", name: "", email: "no" }), {
    username: "Usa entre 3 y 64 letras, números, puntos, guiones o guiones bajos.",
    name: "Escribe el nombre de la persona.",
    email: "Escribe un correo válido.",
  });
  assert.deepEqual(
    validateEmployeeInvitation({ username: "Ana-01", name: "Ana", email: "ana@example.test" }),
    {},
  );
  assert.equal(
    validateEmployeeInvitation({
      username: "ana",
      name: "x".repeat(121),
      email: "ana@example.test",
    }).name,
    "El nombre no puede superar 120 caracteres.",
  );
});

test("administrative account creation validates contact fields without collecting a password", () => {
  assert.deepEqual(
    validateEmployeeCreation({
      username: "Ana-01",
      name: "Ana",
      email: "ana@example.test",
      phone: "+1 (809) 555-0132",
      role: "employee",
    }),
    {},
  );
  assert.deepEqual(
    validateEmployeeCreation({
      username: "a",
      name: "",
      email: "not-an-email",
      phone: "12-34",
      role: "owner",
    }),
    {
      username: "Usa entre 3 y 64 letras, números, puntos, guiones o guiones bajos.",
      name: "Escribe el nombre de la persona.",
      email: "Escribe un correo válido.",
      phone: "Escribe un teléfono válido con entre 7 y 15 dígitos.",
      role: "Selecciona un rol válido.",
    },
  );
});

test("employee success requires an effective server profile confirmation", () => {
  const profile = { username: "ana", active: false, role: "employee", permissions: ["sales"] };
  assert.equal(requireConfirmedEmployeeProfile({ profile }, "ANA", { active: false }), profile);
  assert.throws(() => requireConfirmedEmployeeProfile({}, "ana"), /no confirmó/i);
  assert.throws(
    () => requireConfirmedEmployeeProfile({ profile }, "ana", { active: true }),
    /no confirmó/i,
  );
});

test("employee update confirmation requires the saved phone when one was requested", () => {
  const profile = {
    username: "ana",
    active: false,
    role: "employee",
    permissions: ["sales"],
    phone: "+18095550132",
  };
  assert.equal(
    requireConfirmedEmployeeProfile({ profile }, "ana", { phone: "+18095550132" }),
    profile,
  );
  assert.throws(
    () =>
      requireConfirmedEmployeeProfile({ profile: { ...profile, phone: null } }, "ana", {
        phone: "+18095550132",
      }),
    /no confirmó/i,
  );
});

test("CHG-22 migration adds a server-only password rotation gate and phone read grant", () => {
  assert.match(chg22Migration, /ADD COLUMN phone text/);
  assert.match(chg22Migration, /password_change_required boolean NOT NULL DEFAULT false/);
  assert.match(chg22Migration, /GRANT SELECT \(phone\) ON public\.user_profiles TO authenticated/);
  assert.doesNotMatch(chg22Migration, /GRANT SELECT ON public\.user_profiles TO authenticated/);
  assert.doesNotMatch(chg22Migration, /GRANT UPDATE .*user_profiles TO authenticated/s);
});

test("CHG-22 exposes separate account creation and first-password setup routes", () => {
  assert.match(runtimeRoutes, /path: "\/team\/new"/);
  assert.match(runtimeRoutes, /path: "\/setup-account"/);
  assert.match(chg22CreatePage, /Solo un administrador activo/);
  assert.match(chg22CreatePage, /confirm_admin_creation|confirmAdminCreation/);
  assert.match(chg22SetupPage, /complete-initial-password/);
  assert.match(chg22SetupPage, /cancelPasswordSetup/);
  assert.match(chg22SetupPage, /aria-live="polite"/);
});

test("initial-password completion is identity-bound and never returns the password", () => {
  assert.match(initialPasswordFunction, /caller\.auth\.getUser\(token\)/);
  assert.match(initialPasswordFunction, /email_confirmed_at/);
  assert.match(initialPasswordFunction, /password_change_required/);
  assert.match(initialPasswordFunction, /updateUserById\(identity\.user\.id, \{ password \}\)/);
  assert.match(initialPasswordFunction, /return json\(request, 200, \{ completed: true \}\)/);
  assert.doesNotMatch(initialPasswordFunction, /console\.(?:log|info|error).*password/i);
});

test("employee permission errors use Spanish server-safe feedback", () => {
  assert.equal(
    employeeActionErrorMessage({ context: new Response(null, { status: 403 }) }, "update"),
    "No tienes permiso para administrar esta cuenta.",
  );
});

test("account-management and recovery feedback stays in Spanish", () => {
  assert.doesNotMatch(
    teamSource,
    /Invitation sent|Verified email and activated account/i,
    "team feedback must be Spanish",
  );
  assert.doesNotMatch(
    recoverySource,
    /[\u00c3\u00c2\ufffd]/u,
    "recovery screen must not contain mojibake",
  );
  assert.match(recoverySource, /recuperación/i, "recovery copy must use proper Spanish accents");
});

test("login, recovery, and password reset expose accessible pending and field errors", () => {
  assert.match(loginSource, /aria-live="polite"/, "login should announce authentication progress");
  assert.match(
    recoverySource,
    /aria-describedby/,
    "recovery errors must be associated with the field",
  );
  assert.match(
    resetSource,
    /aria-describedby/,
    "password errors must be associated with the fields",
  );
  assert.match(
    resetSource,
    /finally/,
    "reset requests must leave pending state after a network error",
  );
});

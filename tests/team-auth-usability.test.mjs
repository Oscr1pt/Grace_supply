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

test("employee inactivity is not presented as unconfirmed email", () => {
  assert.doesNotMatch(
    teamSource,
    /Pendiente de correo confirmado/i,
    "inactivity must not be described as unconfirmed mail",
  );
  assert.match(
    teamSource,
    /getEmployeeAccountStatus\(employee\.active\)/,
    "display state derived from the active flag only",
  );
});

test("employee status does not infer email confirmation from inactivity", () => {
  assert.deepEqual(getEmployeeAccountStatus(false), {
    label: "Cuenta inactiva",
    description: "El correo se verifica en el servidor antes de activar el acceso.",
    tone: "inactive",
  });
  assert.equal(getEmployeeAccountStatus(true).label, "Cuenta activa");
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

test("administrative account creation validates phone and temporary password without persisting either", () => {
  assert.deepEqual(
    validateEmployeeCreation({
      username: "Ana-01",
      name: "Ana",
      email: "ana@example.test",
      phone: "+1 (809) 555-0132",
      role: "employee",
      initialPassword: "Secure-initial-9!",
      confirmPassword: "Secure-initial-9!",
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
      initialPassword: "short",
      confirmPassword: "different",
    }),
    {
      username: "Usa entre 3 y 64 letras, números, puntos, guiones o guiones bajos.",
      name: "Escribe el nombre de la persona.",
      email: "Escribe un correo válido.",
      phone: "Escribe un teléfono válido con entre 7 y 15 dígitos.",
      role: "Selecciona un rol válido.",
      initialPassword: "La contraseña inicial debe tener al menos 12 caracteres.",
      confirmPassword: "Las contraseñas no coinciden.",
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

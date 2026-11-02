import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  employeeActionErrorMessage,
  getEmployeeAccountStatus,
  requireConfirmedEmployeeProfile,
  validateEmployeeInvitation,
} from "../src/lib/employeeManagement.js";

const teamSource = readFileSync(new URL("../src/routes/_app/team.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../src/routes/login.tsx", import.meta.url), "utf8");
const recoverySource = readFileSync(new URL("../src/routes/recover.tsx", import.meta.url), "utf8");
const resetSource = readFileSync(
  new URL("../src/routes/reset-password.tsx", import.meta.url),
  "utf8",
);

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

test("employee success requires an effective server profile confirmation", () => {
  const profile = { username: "ana", active: false, role: "employee", permissions: ["sales"] };
  assert.equal(requireConfirmedEmployeeProfile({ profile }, "ANA", { active: false }), profile);
  assert.throws(() => requireConfirmedEmployeeProfile({}, "ana"), /no confirmó/i);
  assert.throws(
    () => requireConfirmedEmployeeProfile({ profile }, "ana", { active: true }),
    /no confirmó/i,
  );
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
    /recuperaciÃ³n|habilitara|mÃ¡s tarde/i,
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

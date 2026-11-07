import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  employeeActionErrorMessage,
  getEmployeeAccountStatus,
} from "../src/lib/employeeManagement.js";

const teamSource = readFileSync(new URL("../src/routes/_app/team.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../src/lib/auth.tsx", import.meta.url), "utf8");
const manageProfileSource = readFileSync(
  new URL("../supabase/functions/manage-profile/index.ts", import.meta.url),
  "utf8",
);

test("CHG-31 keeps employee provisioning closed until server prerequisites are valid", () => {
  assert.match(manageProfileSource, /provisioningPrerequisites/);
  assert.match(manageProfileSource, /APP_PUBLIC_ORIGIN/);
  assert.match(manageProfileSource, /APP_ALLOWED_ORIGINS/);
  assert.match(manageProfileSource, /Las invitaciones no están habilitadas/);
  assert.doesNotMatch(manageProfileSource, /service_role.*frontend|service-role.*browser/i);
});

test("CHG-31 reconciles uncertain profile updates by reading the same identity", () => {
  assert.match(authSource, /\.from\("user_profiles"\)/);
  assert.match(authSource, /\.eq\("username", username\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(authSource, /Resultado no confirmado|no se pudo confirmar/i);
  assert.match(teamSource, /Resultado no confirmado/);
});

test("CHG-31 exposes distinct account states without inferring email from inactivity", () => {
  assert.equal(getEmployeeAccountStatus(false).label, "Cuenta inactiva");
  assert.equal(getEmployeeAccountStatus(false, true).label, "Activación pendiente");
  assert.equal(getEmployeeAccountStatus(false, false, false).label, "Pendiente de correo");
  assert.equal(getEmployeeAccountStatus(true).label, "Cuenta activa");
});

test("CHG-31 keeps permission and transport errors distinct", () => {
  assert.equal(
    employeeActionErrorMessage({ context: new Response(null, { status: 403 }) }, "update"),
    "No tienes permiso para administrar esta cuenta.",
  );
  assert.match(
    employeeActionErrorMessage({ context: new Response(null, { status: 503 }) }, "invite"),
    /invitaciones no están habilitadas/i,
  );
});

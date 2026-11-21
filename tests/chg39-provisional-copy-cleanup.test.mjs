import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("disabled recovery renders no placeholder while preserving the enabled recovery link", () => {
  const source = read("src/routes/login.tsx");
  assert.doesNotMatch(source, /La recuperaci[Ã³o]n se habilitar[Ã¡a]/u);
  assert.match(source, /accountRecoveryEnabled\s*&&/u);
  assert.match(source, /to="\/recover"/u);
  assert.match(source, /Entrar al sistema/u);
});

test("dashboard removes internal tax-policy explanation and keeps permission feedback", () => {
  const source = read("src/routes/_app/dashboard.tsx");
  assert.doesNotMatch(source, /El formulario comprueba la pol[Ã­i]tica tributaria/u);
  assert.match(source, /No hay acciones adicionales disponibles para los permisos de tu cuenta/u);
});

test("settings removes only explanatory copy and keeps ITBIS controls without dangling description", () => {
  const source = read("src/routes/_app/settings.tsx");
  assert.doesNotMatch(source, /La tasa admitida para V1 es 18 %/u);
  assert.match(source, /Aplicar ITBIS/u);
  assert.match(source, /taxRate:\s*18/u);
  assert.match(source, /Guardar ajustes/u);
  assert.match(source, /Restablecer valores/u);
  assert.doesNotMatch(source, /settings-taxRate-help/u);
});

test("real administrative account restriction remains available", () => {
  const source = read("src/lib/employeeManagement.js");
  assert.match(source, /La cuenta requiere revisi.{1,2}n administrativa antes de activarse/u);
});

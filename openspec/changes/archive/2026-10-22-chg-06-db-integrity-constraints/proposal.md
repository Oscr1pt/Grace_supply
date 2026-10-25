# Proposal — Integridad relacional, financiera y de inventario

## Why

Los SQL locales permiten estados sin restricciones suficientes, referencias polimórficas sin FK y líneas de venta embebidas. El esquema limpio debe hacer que PostgreSQL rechace estados inválidos.

## What Changes

- Definir relaciones y líneas normalizadas con UUID y referencias tipadas.
- Incorporar CHECK, FK, UNIQUE e índices justificados en las migraciones iniciales.
- Probar instalación limpia con fixtures sintéticas; no mapear ni preservar filas ficticias.

## Capabilities

### New Capabilities

- relational-financial-integrity: integridad relacional, financiera y de inventario.

### Modified Capabilities

Ninguna.

## Impact

Contrato TypeScript/SQL de ventas, compras, créditos, pagos, inventario y gastos.

## Acceptance

PostgreSQL impide referencias inválidas, montos fuera de dominio, stock negativo y duplicados restringidos. Las reglas tributarias y comerciales aún no aprobadas permanecen explícitas.

## Dependencies

Diseño coordinado con CHG-03: CHG-06 define relaciones e invariantes; CHG-03 las incorpora en el baseline versionado. Provee invariantes a CHG-07. CHG-05 define permisos para tablas nuevas.

## Constraints

UUID y NUMERIC(14,2)/DOP son la convención propuesta para el esquema nuevo. Datos reales inesperados detienen cualquier operación destructiva.

## Validation

Revisión manual de consistencia solamente. OpenSpec CLI no está disponible en este entorno, por lo que esta propuesta no está oficialmente validada; ejecutar `openspec validate chg-06-db-integrity-constraints --strict` antes de implementar.


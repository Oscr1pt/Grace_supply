# Tasks

Planificación: tres tareas principales, pendientes. Diseñar conjuntamente con CHG-03 las tablas, relaciones e invariantes del esquema limpio; CHG-03 versiona el baseline y CHG-06 define sus restricciones. No mapear ni conservar filas ficticias. Si se encuentran datos reales inesperados, detenerse y pedir autorización aparte.

## 1. Relaciones y dominios

- [x] 1.1 Acordar con CHG-03 el modelo de documentos, contrapartes, artículos, líneas de venta y pagos tipados con UUID, importes decimales y snapshots de operaciones nuevas; verificar el contrato TypeScript/SQL con fixtures sintéticas, sin mapeos heredados.

## 2. Restricciones y remediación de datos

- [x] 2.1 Definir CHECK/FK/UNIQUE e índices justificados como parte de las migraciones iniciales; verificar casos válidos e inválidos y planes de consulta. No añadir saneamiento, backfill ni conciliación de registros ficticios.

## 3. Compatibilidad y rechazo integrado

- [x] 3.1 Probar bootstrap limpio en Supabase local/aislado con montos inválidos/no finitos, stock negativo, referencias huérfanas, pago ambiguo y documentos duplicados; verificar rechazo por PostgreSQL y repetibilidad de migraciones sin debilitar permisos.


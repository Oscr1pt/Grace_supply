# Tasks

Planificación: tres tareas del roadmap, pendientes. Toda migración requiere CHG-03 y gates de CHG-00.

## 1. Relaciones y dominios

- [ ] 1.1 Modelar referencias de documentos/contrapartes/artículos, líneas de venta y pago-crédito tipado con IDs compatibles y decimales del diseño; verificar modelo y adaptadores con fixtures de ambos tipos de crédito e IDs heredados, documentando reglas y preservación de snapshots.

## 2. Restricciones y remediación de datos

- [ ] 2.1 Implementar en versiones las CHECK/FK/UNIQUE e índices justificados y plan de resolución aprobada de anomalías existentes; verificar cada restricción con casos válidos/ inválidos y revisión de planes de consulta, sin borrar historia ni recalcular importes automáticamente.

## 3. Compatibilidad y rechazo integrado

- [ ] 3.1 Probar instalación/upgrade en staging con montos inválidos/no finitos, stock negativo, referencias huérfanas, pago ambiguo y documentos duplicados; verificar rechazo por PostgreSQL, conservación de conteos/totales/relaciones y recuperación compatible sin debilitar permisos.


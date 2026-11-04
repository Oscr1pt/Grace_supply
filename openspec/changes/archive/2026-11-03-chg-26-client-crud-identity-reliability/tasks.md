# Tasks

## 1. Payloads y CRUD confiable

- [x] 1.1 Construir payloads explícitos para alta/edición de clientes, excluir columnas generadas y preservar formularios ante error; verificar con regresión de PATCH que incluye `rncNormalized` en la fila cargada y no produce 428C9.

## 2. Identidad y compatibilidad histórica

- [x] 2.1 Reforzar validación de cédula/RNC, duplicados, homónimos y confirmación explícita sin bloquear históricos sin documento; verificar con REST directo, RLS y pruebas de concurrencia.

## 3. Evidencia y regresiones

- [x] 3.1 Ejecutar pruebas unitarias, integración y navegador de clientes, además de TypeScript, ESLint, build, `git diff --check` y OpenSpec estricto; documentar cualquier migración forward-only necesaria.

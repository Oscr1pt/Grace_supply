# Design

## Context

Grace Supply continúa en desarrollo, no está publicado ni entregado y no tiene usuarios finales operando. Las filas del proyecto anterior `ooytnnqxlxxgyenrutky` son de prueba y no necesitan migrarse. El nuevo destino aprobado es `qazjfofpfcwopcefupjl`; el alias `supabase-grace-v2-write` no prueba por sí solo el destino y su URL debe verificarse antes de cualquier operación remota. El remote Git verificado es Oscr1pt/Grace_supply y no equivale al destino Supabase. Las migraciones y el esquema de referencia deben conservarse.

La API de Supabase puede ser accesible por Internet aunque no exista un dominio público. Por eso sigue siendo necesario verificar el project ref, los grants, RLS, políticas, vistas y RPC, sin consultar filas privadas. La evidencia local en SQL y auth.tsx describe el repositorio, no el estado remoto.

## Goals / Non-Goals

**Goals:** verificar la identidad del destino nuevo, hacer reproducibles los cambios de seguridad propios de CHG-00, evaluar el acceso efectivo a recursos y documentar su recuperación. La construcción integral del esquema comercial corresponde a CHG-03 coordinado con CHG-06.

**Non-Goals:** ejecutar contención, resetear la base, eliminar datos, cambiar credenciales/Auth o certificar un despliegue durante esta actualización de OpenSpec.

## Decisions

### Identidad y controles iniciales

Antes de toda consulta remota, comprobar que la URL real de `supabase-grace-v2-write` contiene exactamente `qazjfofpfcwopcefupjl`; detenerse ante discrepancias. La tarea 1.1 y `docs/chg-00-containment-evidence.md` son evidencia histórica de `ooytnnqxlxxgyenrutky` y no prueban identidad, estado ni protección del proyecto nuevo. Inspeccionar en el nuevo proyecto solo metadatos de esquema, migraciones, grants, RLS/policies, vistas y RPC; no leer filas privadas. Registrar por recurso los antecedentes, observaciones remotas y pendientes. Evaluar REST/RPC y GraphQL por los privilegios efectivos de los roles y RLS/policies. La disponibilidad del endpoint o HTTP 200 no demuestra acceso a recursos privados.

### Entornos de desarrollo

No exigir un proyecto Supabase de staging independiente para cada cambio. Usar Supabase local o un proyecto de pruebas aislado, con cuentas y fixtures sintéticas. Antes de la entrega sí se requiere configuración separada de producción y una prueba integral. Mantener fuera del repositorio credenciales, tokens y dumps sensibles.

Las filas actuales son de prueba y no necesitan migración ni conservación histórica. El código, la secuencia versionada de migraciones, la configuración no secreta y el esquema de referencia sí se conservan. Si aparece información real inesperada o se confirma que otra aplicación comparte el proyecto, detener cualquier plan de reset y pedir autorización para un alcance concreto.

### Recuperación durante desarrollo y antes de entrega

Durante CHG-00, verificar la recuperación de sus propios cambios de seguridad en una base aislada o mediante una sonda transaccional reversible, usando fixtures sintéticas; inyectar un fallo controlado y comprobar rollback, objetos de CHG-00 e historial versionado. No preservar filas del proyecto anterior, pues se reconstruye un proyecto de desarrollo sin datos históricos que conservar. La reconstrucción integral del esquema comercial y su recuperación corresponden a CHG-03 coordinado con CHG-06. Documentar para la entrega la cobertura de backup (incluidos límites de Auth/configuración), custodio y restauración aislada. RPO/RTO y presupuesto son decisiones pendientes con el cliente antes de producción, no condiciones para iniciar o validar el desarrollo. No requerir un proyecto separado de staging para cada cambio.

### Acciones destructivas

Esta propuesta no ejecuta acciones contra Supabase. Cualquier DROP, TRUNCATE, DELETE, reset de base o recreación de Auth requiere autorización explícita y separada del usuario después de presentar project ref, objetos afectados y plan de reconstrucción. Una respuesta de metadatos no sustituye esa autorización.

## Risks / Trade-offs

- La API sigue expuesta aunque no exista publicación web → verificar grants/RLS y negar anon antes de dar acceso a datos.
- El project ref puede apuntar a otro entorno → confirmar identidad y detenerse si no coincide.
- Una prueba podría hallar datos reales → no resetear; solicitar confirmación y revisar alcance.
- Un backup puede omitir Auth/configuración → registrar cobertura y ensayar restauración aislada antes de entrega.

## Migration Plan

Primero verificar el project ref desde la configuración real del MCP y luego inventariar el estado inicial del proyecto nuevo mediante metadatos. Preparar una secuencia reproducible de las migraciones propias de CHG-00 y probar sus controles en Supabase local o entorno aislado con datos sintéticos; presentar el alcance antes de cualquier SQL remoto. La secuencia completa del esquema comercial se construye y valida en CHG-03 coordinado con CHG-06. Antes de la entrega, separar configuración productiva, acordar objetivos de recuperación y verificar Auth/RLS. No se migran ni preservan filas ficticias del proyecto anterior.

Ante un fallo, conservar el esquema de referencia y las migraciones, mantener cerrada la superficie anónima y corregir en un entorno aislado. El rollback se ensaya sobre la base sintética y no requiere una restauración de datos históricos. No restaurar políticas permisivas ni ejecutar reseteos destructivos remotos.


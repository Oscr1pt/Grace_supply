# Proposal — Contención y recuperación verificable

## Why

El roadmap registra exposición anónima y de contraseñas previamente confirmada en el proyecto histórico `ooytnnqxlxxgyenrutky`. Grace Supply aún está en desarrollo y no está publicado, pero su API puede ser accesible por Internet. La reconstrucción se dirigirá al nuevo proyecto `qazjfofpfcwopcefupjl`, usando el MCP `supabase-grace-v2-write` solo después de comprobar que su URL corresponde a ese ref.

## What Changes

- Tratar `ooytnnqxlxxgyenrutky` solo como referencia histórica y verificar la URL del MCP contra `qazjfofpfcwopcefupjl` antes de cualquier operación remota.
- Verificar por separado la identidad y los controles iniciales del proyecto nuevo mediante metadatos, sin consultar filas privadas.
- Preparar y verificar de forma reproducible solo las migraciones y controles de seguridad propios de CHG-00, usando Supabase local o un entorno aislado y datos sintéticos. La reconstrucción completa del esquema comercial corresponde a CHG-03 coordinado con CHG-06; no es un prerrequisito de CHG-00 ni se exige staging separado para cada Change.
- Evaluar REST, RPC y GraphQL por privilegios efectivos, RLS/policies y acceso a recursos. Una respuesta HTTP 200 o la disponibilidad del endpoint GraphQL no prueban por sí solas acceso a datos. Deshabilitar pg_graphql solo si está instalado y es viable hacerlo con autoridad y dependencias verificadas; no cambiar roles internos de Supabase.
- Documentar configuración separada y recuperación ensayada para el entorno de desarrollo; no migrar filas de prueba. Dejar cobertura, objetivos RPO/RTO y presupuesto como decisiones con el cliente antes de la entrega a producción.

## Capabilities

### New Capabilities

- database-access-containment: contención y recuperación verificable.

### Modified Capabilities

Ninguna.

## Impact

Superficie REST/RPC, esquema versionado, Auth/RLS y proceso previo a la entrega.

## Acceptance

El destino nuevo se identifica correctamente antes de toda consulta remota y sus controles iniciales se documentan por separado de la evidencia histórica. Las migraciones y controles de seguridad propios de CHG-00 son reproducibles y se verifican con metadatos y pruebas sintéticas; la reconstrucción completa del esquema comercial corresponde a CHG-03 coordinado con CHG-06. El acceso REST, RPC y GraphQL se evalúa por los privilegios efectivos y RLS/policies; HTTP 200 por sí solo no demuestra acceso a datos. El ensayo acotado de recuperación de CHG-00 demuestra rollback sin alterar sus objetos ni el historial. No se migran ni preservan filas del proyecto anterior. RPO/RTO y presupuesto quedan pendientes para acordar con el cliente antes de producción y no bloquean el desarrollo. El proyecto histórico no se modifica en este Change.

## Dependencies

Primero en el roadmap; habilita CHG-01, CHG-03 y preparación coordinada de CHG-04/05. CHG-05 implementa la autorización permanente.

## Constraints

Conservar código, migraciones, esquema de referencia y configuración no secreta. No preservar filas de prueba ni ejecutar reseteos destructivos. Cualquier SQL remoto debe apuntar al ref nuevo ya confirmado; antes de su primera ejecución se presenta el alcance exacto, los objetos afectados y el efecto esperado.

## Validation

Validar los ocho Changes con `openspec validate --changes --strict` antes de implementar y volver a validar después de corregir los hallazgos de planificación.


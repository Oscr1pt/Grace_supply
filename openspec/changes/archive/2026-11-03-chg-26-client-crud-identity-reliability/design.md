# Design

## Context

La tabla `public.clients` ya tiene validación y unicidad normalizada de documentos, pero la edición reutiliza objetos completos y puede enviar columnas generadas. El contrato debe seguir siendo compatible con clientes históricos sin documento.

## Goals / Non-Goals

**Goals:**

- Separar campos editables de columnas calculadas o de servidor.
- Validar nuevas altas antes de enviar y mantener las garantías PostgreSQL bajo concurrencia.
- Hacer recuperables los fallos sin perder la entrada del usuario.

**Non-Goals:**

- No fusionar, borrar ni completar automáticamente clientes históricos.
- No relajar RLS, cambiar referencias financieras ni modificar Changes archivados.

## Decisions

- Usar constructores explícitos de payload para INSERT y UPDATE; nunca serializar el registro completo.
- Mantener la unicidad del documento normalizado en PostgreSQL y excluir el UUID editado de la comprobación de duplicado.
- Tratar nombres iguales como advertencia resoluble: mostrar coincidencias autorizadas y exigir confirmación de personas diferentes cuando los documentos difieran.
- Si existe una restricción nueva de documento obligatorio, aplicarla solo a nuevas filas mediante validación/trigger compatible con históricos, después de un preflight de datos.
- Mapear 428C9, conflictos de unicidad, RLS y transporte a mensajes seguros y conservar el formulario.

## Risks / Trade-offs

- [Riesgo] Datos históricos sin documento impedirían una restricción global → [Mitigación] validar solo nuevas escrituras y documentar un proceso autorizado de completado.
- [Riesgo] Dos altas concurrentes con el mismo documento → [Mitigación] mantener índice/constraint PostgreSQL y tratar el conflicto como recuperable.
- [Riesgo] Payload incompleto en edición → [Mitigación] pruebas de regresión con fila cargada y comparación de campos editables.

## Migration Plan

Ejecutar primero un preflight de columnas, constraints y duplicados. Si hace falta, añadir una migración forward-only que afecte únicamente nuevas escrituras. No editar migraciones aplicadas ni ejecutar `supabase db push` sin revisar el historial Cloud.

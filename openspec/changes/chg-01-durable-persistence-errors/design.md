# Design

## Context

Ver `proposal.md` (Finding 7). `storage.ts` espera las promesas pero no inspecciona `error` y siempre actualiza estado/localStorage; también silencia excepciones. `settings.ts` cambia estado antes de guardar y omite errores de lectura/escritura. `settings.tsx` y `team.tsx` disparan acciones sin esperar; toggles y eliminación de empleados necesitan el mismo tratamiento. Ventas/compras/abonos encadenan llamadas; etiquetas también persisten ajustes mediante callbacks. No se ejecutaron pruebas remotas ni se conoce el estado de RLS desplegado.

## Goals / Non-Goals

**Goals:** un contrato de escritura confirmado/error/incierto que todos los consumidores respeten, con evidencia por ID y filas esperadas.

**Non-Goals:** crear transacciones financieras (CHG-07), reemplazar Auth (CHG-04), agregar cola offline o resolver limpieza general de cachés entre usuarios (CHG-09).

## Decisions

### Contrato único de persistencia

La futura capa de datos deberá devolver resultado confirmado con entidad canónica/ID, o un error tipado (denegado, validación, no encontrado/conflicto, transporte, incierto). Inspeccionar `error` de Supabase además de excepciones; no asumir que una promesa resuelta implica éxito. Insert/update/delete de una fila comprobarán exactamente un identificador afectado mediante respuesta acotada; cero o varias filas fallan el contrato. Los recursos con políticas que impidan devolver el ID requerirán un contrato de servidor que certifique la mutación; no se ampliará SELECT para hacer pasar la comprobación.

Alternativas: solo capturar excepciones deja pasar respuestas con error; confiar en ausencia de error deja pasar actualizaciones de cero filas. El resultado deberá mantener el mismo significado cuando CHG-04 cambie el transporte de empleados y CHG-07 use RPC.

### Estado confirmado después de la respuesta

Actualizar la copia local confirmada y su caché exclusivamente después de persistencia verificada. Conservar estado de formulario separado en memoria; no almacenar entrada sensible adicional ni introducir cola duradera offline. Las lecturas fallidas mostrarán error y, si se conserva una lectura previa, su condición de obsoleta. Defaults de ajustes no se presentarán como valores recuperados remotamente cuando falla la consulta.

Escrituras pendientes deshabilitan repetición del mismo envío, mantienen datos editados y permiten recuperación ante fallo. Un toast, impresión, cierre o reset ocurre después de await exitoso del conjunto requerido. Se aplicará a todos los consumidores del hook: catálogos, stock, ventas/compras, créditos/pagos y gastos; ajustes incluye guardar/reset y etiquetas; equipo incluye alta, permisos y baja. Error redactado para usuario y contexto técnico mínimo sin payloads privados.

### Resultado incierto y fallos parciales

Un timeout no prueba rollback: consultar por ID estable o clave si está disponible antes de decidir. No reintentar automáticamente inserciones ni generar otro ID. Si no puede verificarse el resultado, mantenerlo incierto y requerir reconciliación. CHG-07 entregará idempotencia de negocio, no se simula aquí.

Mientras existan secuencias múltiples, un fallo intermedio detiene la confirmación global y registra necesidad de reconciliación con los IDs confirmados. No afirmar que se deshizo lo anterior ni ejecutar una compensación improvisada. Esto reduce confirmaciones falsas, pero no elimina parcialidad: CHG-07 es condición para operaciones atómicas.

## Risks / Trade-offs

- [RLS oculta filas afectadas] → obtener recibo mínimo autorizado o error; nunca transformar una denegación en éxito local.
- [Fallos antes ocultos interrumpen flujos] → mensajes recuperables, estado pendiente y entrada conservada.
- [Transacción parcial ya existente] → no repetir a ciegas ni borrar evidencia; reconciliar y mantener riesgo abierto hasta CHG-07.
- [Callbacks de ajustes disparan muchas escrituras] → serializar por recurso o controlar respuestas obsoletas; una respuesta anterior no debe sustituir una confirmación más reciente.

## Migration Plan

Requiere CHG-00. En implementación futura, introducir contrato y pruebas de error/cero filas primero, adaptar hooks y luego sus consumidores, documentando estados visibles. Validar con sintéticos de staging y pruebas de componente/transporte para errores de respuesta, excepción, RLS, timeout y éxito confirmado; revisar persistencia con una lectura autorizada posterior.

Salida: cada flujo cumple los escenarios de `verified-persistence`; no hay toast/impresión/cierre antes de confirmación. CHG-04/07 conservarán este contrato al cambiar sus llamadas. Recuperación: retornar a una release que cumpla el contrato o cerrar escrituras afectadas. No reactivar el fallback de éxito local para ocultar regresiones. No hay cambio de esquema que revertir en este Change.

## Decisiones que requieren aprobación

Aceptar escrituras offline como no guardadas y reconciliación explícita de resultados inciertos. El destino y aprobación operacional siguen CHG-00. No se necesita ampliar el alcance ni añadir subtareas: las tres unidades del roadmap cubren contrato, adaptación y verificación integrada.


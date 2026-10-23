# CHG-01: estados de persistencia

Las escrituras remotas solo quedan confirmadas cuando Supabase responde sin error con exactamente una fila cuyo identificador coincide con el enviado. Una promesa resuelta sin filas, un identificador distinto o varias filas no equivalen a éxito.

| Estado | Condición | Mensaje/recuperación |
| --- | --- | --- |
| Confirmada | Una fila devuelta con el ID esperado | Actualizar el estado confirmado y permitir el mensaje de éxito. |
| Denegada | Código PostgreSQL `42501` o HTTP `401`/`403` | Informar falta de autorización sin exponer detalles internos. |
| No encontrada | Cero filas, ID sin coincidencia o `PGRST116` | Mantener el estado confirmado anterior. |
| Conflicto | Más de una fila, clave duplicada o referencia inválida | Mantener la entrada para corregirla o reconciliarla. |
| Validación | Error SQL de clases `22`/`23` que no sea conflicto | Pedir revisar los datos sin limpiar el formulario. |
| Transporte | Fallo de conexión antes de confirmar una lectura | Mostrar datos previos como obsoletos, si se conservan. |
| Incierta | Excepción o pérdida de respuesta durante una escritura | Verificar el mismo ID antes de repetir; nunca reintentar automáticamente. |

Los errores originales no se presentan al usuario porque pueden incluir detalles SQL o información privada. El código técnico puede conservarse en registros protegidos del servicio, sin payloads de formularios.

## Pruebas automatizadas aisladas

Ejecutar `node --test tests/persistence.test.mjs`. Los fixtures sintéticos cubren error de permiso, excepción de transporte posterior al envío, cero filas, una fila confirmada y varias filas. Esta suite no usa datos de negocio ni un proyecto remoto.

Las pruebas de RLS dependen de que CHG-05 defina políticas e identidades de prueba. La verificación del transporte de empleados depende de CHG-04. Esas dependencias no se consideran evidencia de autenticación ni de autorización implementada por CHG-01.

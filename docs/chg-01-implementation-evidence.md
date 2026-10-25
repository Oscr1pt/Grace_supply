# CHG-01 — Evidencia de implementación y cierre pendiente

## Contrato aplicado

- `src/lib/persistence.js` convierte errores de Supabase en estados de autorización, validación, inexistencia, conflicto, transporte, incertidumbre y servicio sin exponer SQL/payloads.
- Insert/update/delete esperan respuesta con la cantidad e identidad esperadas. `useSupabaseTable` y los formularios solo confirman y modifican caché después de esa respuesta.
- Inserciones inciertas reconcilian por el mismo ID estable; no generan otra identidad ni repiten automáticamente. Cambios del mismo registro se serializan y lecturas antiguas no sustituyen resultados recientes.
- El grant de CHG-05 permite ID estable en `clients`, `suppliers`, `inventory` y `expenses`; la serializacion omite `created_at` en esas tablas y usa el default PostgreSQL para respetar grants minimos. `id` no se puede actualizar.
- Ventas, compras y pagos muestran éxito después de los efectos confirmados; un fallo parcial conserva el formulario, identifica los pasos confirmados y no afirma atomicidad ni rollback (CHG-07).
- El caché temporal se marca como obsoleto al fallar la lectura; no tapa errores de base. Borrar caché local no se presenta como borrado remoto.

## Evidencia PostgreSQL local

`RUN_LOCAL_SECURITY_INTEGRATION=1 node --test tests/security.integration.test.mjs`: **21/21 pasaron** con identidades nuevas de Supabase Auth, datos sintéticos, REST/PostgREST, PostgreSQL local y Mailpit.

- Escritura autorizada, lectura posterior y contraste contra la misma fila PostgreSQL.
- RLS denegada y ausencia de filas para permisos cruzados.
- Error SQL real, pérdida de conexión antes del envío y timeout simulado después de que PostgreSQL confirma el INSERT; los dos estados inciertos se resuelven consultando el mismo UUID, con una sola escritura.
- Respuestas de updates por fila se serializan; la fila final coincide con la segunda escritura confirmada.
- Auth/RLS cubre identidad autorizada, revocación, registros no confirmados y uso del ID estable.

## Comprobación de la interfaz y límite de aceptación

La revisión de código confirma que los formularios esperan el Promise de persistencia, solo cierran o imprimen tras el resultado confirmado, y muestran error sin descartar entradas ante fallo. La prueba local ejercita la misma capa de persistencia y las respuestas reales de PostgREST, pero **no automatiza el navegador para provocar cada fallo desde cada formulario ni observar visualmente toast, cierre, impresión y caché**. Ese subcriterio permanece pendiente; no se marca CHG-01 3.1 como completo.

## Dependencias y alcance

- CHG-04 provee identidad Auth real de prueba; CHG-05 provee los grants/RLS que permiten diferenciar persistencia autorizada y denegada. Ambas dependencias ya están disponibles en Supabase local.
- CHG-07 conserva responsabilidad sobre atomicidad de ventas, compras, créditos y pagos.
- No se ejecutaron migraciones en Cloud ni se modificó el proyecto anterior. Ningún Change se archiva mientras queden criterios pendientes.

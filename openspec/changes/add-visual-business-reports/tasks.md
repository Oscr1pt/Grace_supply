# Tasks

## 1. Agregación segura en Supabase

- [x] 1.1 Implementar RPC de solo lectura para período y fecha ancla; verificar con pruebas PostgreSQL que solo devuelve agregados acotados y que no realiza escrituras.
- [x] 1.2 Proteger la RPC para administrador activo; verificar invocación directa como administrador, empleado, anónimo y cuenta revocada, incluyendo EXECUTE grants y RLS efectivo.
- [x] 1.3 Calcular límites semanales, mensuales y anuales en America/Santo_Domingo; verificar límites semiabiertos, lunes inicial, cruces de mes/año y fechas de frontera con pruebas SQL.
- [x] 1.4 Implementar cuatro importes y agrupaciones excluyendo anulaciones; verificar contado/crédito sin doble conteo de abonos, gastos/compras anulados, ITBIS separado, NULL históricos y categorías con fixtures PostgreSQL.
- [x] 1.5 Revisar plan de la RPC para año completo y múltiples registros; verificar cardinalidad de respuesta acotada y documentar o añadir solo índices justificados por el plan.

## 2. Ruta, acceso y lectura

- [x] 2.1 Añadir ruta protegida /reports y acceso lateral visible solo para administradores; verificar navegación como administrador y denegación de empleado, cuenta revocada y sesión ausente tanto en ruta como en llamada directa.
- [x] 2.2 Conectar la pantalla a la RPC reutilizando estado de carga/error existente; verificar carga, vacío, denegación, fallo, reintento y datos obsoletos sin representar errores como RD$0.
- [x] 2.3 Añadir selector semanal, mensual y anual con períodos históricos y rango exacto; verificar cambios de año, fecha ancla y límites mostrados frente a la respuesta de la RPC.

## 3. Indicadores y visualizaciones

- [x] 3.1 Presentar ventas sin ITBIS, gastos operativos, compras e ITBIS informativo en cuatro tarjetas DOP; verificar que etiquetas y cifras coinciden exactamente con los agregados de Supabase.
- [x] 3.2 Implementar gráfico de barras ventas frente a gastos por día, semana o mes según granularidad; verificar cada bucket con fixtures de período y que compras e ITBIS no se mezclan en esas series.
- [x] 3.3 Implementar barras horizontales por categoría de gasto; verificar todas las categorías con movimientos y legibilidad móvil con nombres largos.
- [x] 3.4 Implementar resumen textual derivado del mismo resultado; verificar período vacío, valores reportados, exclusión de utilidad/causas no calculadas y aclaración de anulaciones.

## 4. Impresión y verificación integrada

- [x] 4.1 Crear vista de impresión con negocio, título, período, generación, cuatro indicadores, gráficos, resumen y nota interna no fiscal; verificar contenido y omisión de navegación/controles en CSS de impresión.
- [x] 4.2 Usar exactamente el modelo cargado en pantalla para imprimir/Guardar PDF; verificar igualdad de período, cifras, buckets y resumen en DOM antes de imprimir, y bloqueo durante carga/error.
- [x] 4.3 Verificar responsive escritorio/móvil y reporte anual cargado; ejecutar Playwright con fixtures sintéticos y comprobar ausencia de desbordamientos, además de OpenSpec strict y git diff --check.

## Evidencia complementaria de reconciliación

- 1.1–1.2: `supabase/tests/business_reports_rpc.sql` ejecutado en el PostgreSQL local dedicado; finalizó en `ROLLBACK`. Cubre respuesta agregada, ausencia de escritura, grants, administrador activo/inactivo, segundo administrador, empleado, anónimo y sesión ausente.
- 1.3: la misma prueba confirma intervalo semiabierto de la semana y filas exactamente antes/después del límite local; añade semanas que cruzan mes (`2026-02-23`–`2026-03-02`) y año (`2026-12-28`–`2027-01-04`), además de mes bisiesto y año calendario.
- 1.4: fixture comprueba contado/crédito, que los abonos no se suman, ventas/compras/gastos anulados excluidos, categorías e ITBIS separados. El catálogo PostgreSQL confirma que subtotal, tax, total de compra y amount de gasto son NOT NULL; `voided_at IS NULL` representa documentos vigentes y se incluye en los fixtures. Importes históricos NULL no son representables bajo el esquema actual.
- 1.5: EXPLAIN ANALYZE en una sola transacción con 2,000 filas sintéticas por tabla terminó en ROLLBACK. Plan anual: ventas y compras secuenciales, gastos usan `expenses_date_status_idx`; tiempos observados inferiores a 2 ms en este entorno local. La respuesta RPC anual tuvo 12 buckets, 3 categorías y 1,757 bytes. El volumen de prueba no justifica índices adicionales; no es benchmark de producción.
- 2.3 y 3.1: pruebas de períodos, validación estricta del período/respuesta RPC, Playwright visual y la prueba SQL confirman rangos, selectores, etiquetas y cuatro importes formateados desde el modelo agregado.
- 2.1: verificación end-to-end completada en el stack temporal `gracechg39docs20261121`. Auth, PostgREST y Kong respondieron por loopback; la RPC devolvió 200 para administradores activos y denegó empleado, usuario anónimo y sesión inválida (la prueba acepta los códigos de denegación 401/403). Un token de administrador todavía vigente fue rechazado después de desactivar su perfil; la ruta redirigió a login y el usuario revocado no pudo iniciar sesión. Playwright confirmó que el enlace Reportes solo aparece para administradores, que empleado recibe Acceso restringido sin métricas y que una sesión ausente vuelve a Login.
- 2.2: integración HTTP completada con PostgREST real y la ruta React conectada a la RPC. La respuesta del período con fixtures pasó `parseBusinessReportResponse` y mostró ventas 150.00, gastos 15.00, compras 30.00 e ITBIS 27.00; los documentos anulados quedaron excluidos. Playwright comprobó período vacío confirmado, error de red sin cifras/impresión válida, reintento exitoso, impresión bloqueada durante carga y descarte de la respuesta lenta de un período anterior.
- El stack temporal usa el volumen/red dedicados de CHG-39. Se aplicó allí exclusivamente `20261124174203_business_reports_readonly_rpc.sql` mediante `supabase migration up --local`; el CLI registró esa única migración pendiente. En esa validación local no se aplicó migración remota; posteriormente el RPC se publicó en el proyecto autorizado bajo la versión `20261125181237`. Tras confirmar que el cuerpo SQL remoto coincide exactamente, se renombró solo el archivo local para igualar el timestamp registrado, sin repetir el SQL ni modificar datos financieros. El Edge Runtime existente se inició sin reiniciar los otros servicios y `username-login` respondió 401 a entrada vacía (respuesta esperada).
- Resultado Playwright HTTP: 4/4 PASS en la ejecución final. En una ejecución previa, el cold start dejó `AuthReady` pendiente por más de los 5 s predeterminados del locator; se cambió el helper de prueba para esperar explícitamente `form[aria-busy="false"]` con timeout acotado de 15 s. Otra ejecución detectó que el selector de granularidad restablece el ancla a la fecha actual; se corrigió el fixture/interceptor para fijar explícitamente períodos conocidos y no esperar una solicitud que no podía coincidir. No hubo un hook Playwright fallido: los errores fueron aserciones/flujo del test; `beforeAll` sí creó las identidades y fixtures sintéticos.
- Los fixtures sintéticos de estas ejecuciones permanecen en la base local desechable; no se limpiaron. Las pruebas usaron Auth/GoTrue real para crear cuentas y sesiones, no JWT fabricados. La configuración y solicitudes se limitaron a `127.0.0.1:62001`.

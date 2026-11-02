# Tasks — CHG-19-EXPENSES-OPERATIONAL-UX

> Aplicar **después de comprobar el CHG-18 archivado localmente (3/3)**. El remoto puede estar desfasado: no sobrescribir el checkout local para traer estos documentos. Alcance exclusivo de gastos, sin migraciones ni cambios en contratos Auth/RLS/RPC. Máximo tres tareas; no hacer commit, push ni archivar automáticamente.

## 1. Registro de gastos claro y recuperable
- [x] **1.1** Refinar formulario con validación por campo (concepto, categoría, importe decimal positivo, fecha RD, método, beneficiario y referencia opcional), permisos/estados de carga, guardado y error. Confirmar solo persistencia real, conservar borrador y clave de idempotencia en resultado incierto, impedir doble envío y reintentos con payload diferente. **Verificar:** validaciones, fecha dominicana, persistencia única y fallo de red sin falso éxito.

## 2. Consulta, filtros y anulación
- [x] **2.1** Corregir «hoy»/«mes» en `America/Santo_Domingo`; aclarar totales y periodos, estados registrado/anulado, filtros combinados, loading/empty/error, tabla y detalle responsive/contraste. Sustituir `window.prompt` por diálogo accesible con motivo obligatorio para anulación administrativa idempotente; conservar el original y la auditoría. **Verificar:** día/mes frontera, anulados excluidos de importes activos, teclado/móvil y bloqueo de anulación no autorizada o duplicada.

## 3. QA focalizada de gastos
- [x] **3.1** Probar en un stack local desechable verificado: gasto válido/importe cero, negativo o inválido, fecha fronteriza RD, fallo de red/respuesta perdida, doble clic, cambio de rol, filtros combinados, anulación con motivo y reintento sin duplicación; verificar registro/auditoría real y frontend. Ejecutar pruebas financieras/Auth pertinentes, Playwright focalizado, `npm test`, TypeScript, ESLint, build, `git diff --check` y `openspec validate chg-19-expenses-operational-ux --strict`. **Verificar:** resultados de CHG-19 sin fallos; documentar por separado incidentes de suite global ajenos a este Change, sin declararlos aprobados.

> Completar 3/3 solo con evidencia de cada tarea. Sin cambios fiscales, migraciones, nuevas dependencias de infraestructura o revisiones generales JWT/Docker.

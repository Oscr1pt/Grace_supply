# Tasks â€” CHG-23-CLIENT-IDENTITY-VALIDATION

> Change activo **0/3**. Revisar `feature/frontend-improvements` y confirmar CHG-22 archivado/publicado (commit `a64fdbed49b2c113050ca4bdbb494bf2ec86bcea`). Importar documentos del PR de planificaciÃ³n de forma no destructiva. No commit/push/merge/archive durante Apply.

## 1. ValidaciÃ³n y experiencia de clientes
- [x] **1.1** Implementar `validateClientForm` independiente de proveedores: nombre, email, telÃ©fono cuando exista, cÃ©dula (11) / RNC (9) opcional con normalizaciÃ³n y reglas de comprobaciÃ³n verificadas; errores inline accesibles. Detectar posibles duplicados por documento y nombre+contacto en alta/ediciÃ³n, orientar a ficha existente, permitir homÃ³nimos reales de forma explÃ­cita y excluir el propio ID en ediciÃ³n. **Verificar:** formatos, coincidencias, persistencia de entrada ante errores y no confundir checksum con verificaciÃ³n oficial.

## 2. Integridad y concurrencia en PostgreSQL
- [x] **2.1** AÃ±adir migraciÃ³n versionada de validaciÃ³n y unicidad **de documento no vacÃ­o** con normalizaciÃ³n coherente y rechazo por API/concurrencia. Primero inspeccionar legacy con preflight sin escrituras; no borrar ni fusionar clientes/crÃ©ditos/ventas. Mantener RLS, IDs e historial. Adaptar el manejo de conflictos del cliente sin exponer informaciÃ³n privada. **Verificar:** duplicados entre activos/inactivos, inserciones simultÃ¡neas, documento vacÃ­o permitido, ediciÃ³n de mismo registro y compatibilidad de datos antiguos.

## 3. RegresiÃ³n funcional y seguridad
- [x] **3.1** Probar en Supabase local desechable verificado: validadores unitarios, CRUD navegador, documentos vÃ¡lidos/errÃ³neos, homÃ³nimos, ID duplicado, REST directo, RLS, historial preservado, responsive y teclado. Ejecutar `npm test`, pruebas focalizadas Playwright y DB, TypeScript, ESLint pertinente, build, OpenSpec estricto y `git diff --check`. **Verificar:** suites propias aprobadas sin tocar Cloud ni alterar proveedores; no declarar Â«identidad real verificadaÂ» sin fuente oficial.

> Mantener max 3 tareas. No tocar CHG-22 archivado ni archivos protegidos locales. Si una migraciÃ³n encuentra datos conflictivos o se descubre un problema de autorizaciÃ³n, detener la parte peligrosa e informar, sin limpieza automÃ¡tica.

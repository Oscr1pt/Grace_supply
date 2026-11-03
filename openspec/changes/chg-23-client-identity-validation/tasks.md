# Tasks — CHG-23-CLIENT-IDENTITY-VALIDATION

> Change activo **0/3**. Revisar `feature/frontend-improvements` y confirmar CHG-22 archivado/publicado (commit `a64fdbed49b2c113050ca4bdbb494bf2ec86bcea`). Importar documentos del PR de planificación de forma no destructiva. No commit/push/merge/archive durante Apply.

## 1. Validación y experiencia de clientes
- [ ] **1.1** Implementar `validateClientForm` independiente de proveedores: nombre, email, teléfono cuando exista, cédula (11) / RNC (9) opcional con normalización y reglas de comprobación verificadas; errores inline accesibles. Detectar posibles duplicados por documento y nombre+contacto en alta/edición, orientar a ficha existente, permitir homónimos reales de forma explícita y excluir el propio ID en edición. **Verificar:** formatos, coincidencias, persistencia de entrada ante errores y no confundir checksum con verificación oficial.

## 2. Integridad y concurrencia en PostgreSQL
- [ ] **2.1** Añadir migración versionada de validación y unicidad **de documento no vacío** con normalización coherente y rechazo por API/concurrencia. Primero inspeccionar legacy con preflight sin escrituras; no borrar ni fusionar clientes/créditos/ventas. Mantener RLS, IDs e historial. Adaptar el manejo de conflictos del cliente sin exponer información privada. **Verificar:** duplicados entre activos/inactivos, inserciones simultáneas, documento vacío permitido, edición de mismo registro y compatibilidad de datos antiguos.

## 3. Regresión funcional y seguridad
- [ ] **3.1** Probar en Supabase local desechable verificado: validadores unitarios, CRUD navegador, documentos válidos/erróneos, homónimos, ID duplicado, REST directo, RLS, historial preservado, responsive y teclado. Ejecutar `npm test`, pruebas focalizadas Playwright y DB, TypeScript, ESLint pertinente, build, OpenSpec estricto y `git diff --check`. **Verificar:** suites propias aprobadas sin tocar Cloud ni alterar proveedores; no declarar «identidad real verificada» sin fuente oficial.

> Mantener max 3 tareas. No tocar CHG-22 archivado ni archivos protegidos locales. Si una migración encuentra datos conflictivos o se descubre un problema de autorización, detener la parte peligrosa e informar, sin limpieza automática.

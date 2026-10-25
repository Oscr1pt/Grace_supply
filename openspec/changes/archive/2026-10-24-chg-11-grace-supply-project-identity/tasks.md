# Tasks — CHG-11

## 1. Auditoría de identidad y dependencias
- [x] 1.1 Inventariar en la rama local ACTUAL todas las referencias heredadas; clasificarlas por UI, contratos, configuración, documentación, histórico y externos; revisar Git status y commits no publicados antes de editar. Evidencia: `docs/grace-supply-identity-audit.md`.

## 2. Renombre seguro de aplicación y configuración
- [x] 2.1 Normalizar branding y nombres técnicos modificables a Grace Supply/`grace_supply` y conservar compatibilidad de IDs, scripts, storage keys, URLs y configuración local. No renombrar Cloud, migraciones aplicadas, historial Git ni recursos externos automáticamente. Se renombró el paquete privado y el preset transitorio; se conservaron el project id, los scripts, Auth y claves de compatibilidad.

## 3. Regresión y documentación
- [x] 3.1 Validar búsqueda de referencias, TypeScript, build, tests, dev server, rutas, etiquetas y OpenSpec; documentar las referencias históricas deliberadamente preservadas y cualquier cambio manual pendiente. Evidencia: `docs/grace-supply-identity-audit.md`; `npm test` 37 aprobadas/0 fallidas/1 omitida; `tsc --noEmit`; build (exit 0); rutas locales 200; `openspec validate --changes --strict` 3/3.

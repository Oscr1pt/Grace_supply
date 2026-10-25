# Tasks

Planificación: tres tareas. Priorizar una instalación limpia desde migraciones versionadas; no preservar ni migrar filas ficticias. No se ejecutan migraciones durante esta revisión de artefactos.

## 1. Contrato de esquema e inventario

- [x] 1.1 Definir junto con CHG-06 el esquema canónico desde tipos, consultas y SQL revisado, con convención UUID y recursos completos; antes de cualquier consulta remota, verificar que la URL de `supabase-grace-v2-write` corresponde a `qazjfofpfcwopcefupjl`. No convertir el inventario en una migración histórica de datos de prueba.

## 2. Migraciones versionadas y baseline seguro

- [x] 2.1 Crear una secuencia única y ordenada en `supabase/migrations/` que sustituya los scripts manuales como fuente de instalación; verificar checksum, orden, precondiciones y denegación por defecto. Incorporar el modelo y las constraints acordadas conjuntamente con CHG-06 y coordinar grants/RLS con CHG-05.

## 3. Instalación, actualización y recuperación

- [x] 3.1 Ensayar bootstrap desde base vacía, migraciones sucesivas y semillas sintéticas en Supabase local/aislado; verificar contrato TypeScript/SQL, singleton de ajustes, reproducibilidad y rollback seguro. Si aparecen datos reales, detener el flujo y pedir confirmación antes de cualquier acción destructiva.


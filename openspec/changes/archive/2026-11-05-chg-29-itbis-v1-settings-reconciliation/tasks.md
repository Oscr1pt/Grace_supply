# Tasks

## 1. Simplificar la configuración V1

- [x] 1.1 Eliminar el input editable de tasa en `settings.tsx`, mantener el valor interno fijo de 18%, conservar «Aplicar ITBIS» y validar la navegación/accesibilidad y la persistencia tras recarga con pruebas focalizadas.

## 2. Errores y guardado seguro

- [x] 2.1 Mantener `save_sales_tax_v1` como frontera autorizada, mapear objetos ausentes a un mensaje de actualización del servidor y conservar los mensajes de autorización/conflicto; verificar usuarios autorizados/no autorizados y que no se pierdan valores ante fallos.

## 3. Reconciliación y QA local

- [x] 3.1 Comparar migraciones locales con el historial/objetos Cloud sin escribir, usar `db push --dry-run` solo si el vínculo está verificado, y ejecutar en un stack local las pruebas de ITBIS activado/desactivado, clasificación, stock, idempotencia, recibos, `npm test`, TypeScript, ESLint, build, `git diff --check` y OpenSpec strict.

## Workflow follow-up

- Preparar autorización explícita antes de cualquier despliegue o `db push` real.

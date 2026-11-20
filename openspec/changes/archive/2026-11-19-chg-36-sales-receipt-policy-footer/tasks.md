# Tasks

## 5. Production build configuration protection

- [x] 5.1 Add a fail-closed prebuild check for the approved Supabase URL, the full active public key, auth flags, and the approved UTC cutoff; prove that `VITE_SUPABASE_ANON_KEY=s` is rejected before Vite starts.
- [x] 5.2 Inspect the emitted auth client chunk after build; verify consistent effective URL/key/flags/cutoff and reject privileged credentials in browser assets.
- [x] 5.3 Test the compiled application against isolated local Supabase with a synthetic account and verify login/session/logout/relogin without exposing keys or tokens.
- [x] 5.4 Run the guarded Wrangler dry-run for a release using a future, explicitly approved cutoff; the local test cutoff is not approved for production. **Evidence:** the authorized release preflight and publication used the explicitly approved cutoff `2026-11-18T03:18:00.000Z`; the guarded dry-run passed before publish.

## 1. Vigencia y contenido del recibo

- [x] 1.1 Añadir una comparación pura entre `Sale.createdAt` y `VITE_RECEIPT_POLICY_EFFECTIVE_AT`; probar fechas anterior, igual, posterior, inválida y corte ausente, asegurando que un corte inválido omite el pie.
- [x] 1.2 Actualizar `ReceiptDialog` para conservar «RECIBO INTERNO — NO ES COMPROBANTE FISCAL», sustituir el agradecimiento anterior por «¡GRACIAS POR SU COMPRA!» y mostrar una sola vez, después del total y solo desde la vigencia, el título y los cuatro párrafos aprobados; verificar que los valores del recibo no cambian.

## 2. Impresión

- [x] 2.1 Añadir estilos de impresión estrictamente limitados al diálogo del recibo; verificar que la vista normal y otros documentos imprimibles no cambian.
- [x] 2.2 Probar en Playwright medios de impresión A4 y estrecho sin fijar `@page size`; verificar texto completo, orden, ausencia de desbordamiento horizontal y cortes dentro del pie.

## 3. Historial y estados del recibo

- [x] 3.1 Probar recibos abiertos desde el historial antes y después del corte, incluyendo importe, líneas y nombre históricos sin modificaciones.
- [x] 3.2 Probar recibo anulado posterior al corte, indicador y motivo de anulación, apertura/cierre del diálogo e impresión sin duplicar la política.

## 4. Validación del paquete local

- [x] 4.1 Ejecutar TypeScript, ESLint focalizado, Prettier, pruebas unitarias relacionadas, Playwright focalizado, build, OpenSpec strict y `git diff --check`; registrar únicamente resultados ejecutados.
- [x] 4.2 Confirmar que no hay cambios de ventas, impuestos, recibos persistidos, Supabase ni otros módulos; comprobar que la vigencia del bundle se fija al instante real de publicación antes de solicitar autorización de despliegue. **Evidence:** el diff contiene únicamente el recibo, sus estilos, helper/tipos, guards/scripts de build y publicación, pruebas y documentación de CHG-36. El bundle publicado fijó la vigencia en `2026-11-18T03:18:00.000Z`, con despliegue completado antes del corte; el propietario validó después recibos históricos/nuevos e importes sin modificaciones financieras ni de Supabase.

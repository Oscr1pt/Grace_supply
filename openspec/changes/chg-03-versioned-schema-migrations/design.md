# Design

## Context

Ver `proposal.md` (Findings 8/9). Hay `supabase_migration.sql` y `supabase_migration_expenses.sql`, sin historial versionado ni definición local completa de la base. No hay esquema desplegado exportado ni MCP Supabase disponible: la comparación remota está pendiente y bloquea aplicar, no redactar la propuesta.

Inventario observado en tipos/consultas, no afirmaciones sobre producción:

| Recurso | Contrato local esperado | Evidencia y diferencia local |
| --- | --- | --- |
| users | username, name, role, permissions y campo heredado inseguro | auth.tsx; sin DDL local; CHG-04 retirará el secreto, no se creará un nuevo almacén de contraseñas |
| clients | id, name, email, phone, phone_secondary, rnc, province, city, address, notes, status, created_at | types.ts y clients.tsx; sin DDL local |
| inventory | id, sku, kind, name, category, atributos opcionales, cost_price, price, quantity, created_at | types.ts e inventory.tsx; sin DDL local |
| sales | id, receipt_no, client_id, lines, subtotal, tax_rate, tax, total, payment_type, due_date, created_at | sales.tsx; sin DDL local; lines conserva hoy claves de objeto del cliente |
| purchases | id, supplier, supplier_id, item_id, description, quantity, unit_cost, total, payment_type, invoice_no, due_date, created_at | purchases.tsx; sin DDL local |
| settings | id singleton, business_*, tax_rate, currency y label_* | settings.ts/types.ts; sin DDL local; actualización presupone fila inicial |
| suppliers | UUID y datos de contacto/estado | SQL parcial y types.ts; uid() genera texto incompatible con UUID |
| client_credits / supplier_credits | documento/contraparte, total/paid/balance, estado y fechas | SQL usa UUID en PK y TEXT en referencias; tipos usan string |
| credit_payments | crédito, tipo, importe, fecha, método, referencia/nota | SQL tiene credit_id TEXT polimórfico sin FK |
| expenses | concepto, categoría, monto, fecha, método, beneficiario, estado, actor y tiempos | SQL usa UUID y registered_by de texto; CHG-08 verificará actor |

`toDb/fromDb` convierten claves solo al nivel superior. La conversión de ID y de líneas anidadas debe ser explícita; no se asume una serialización recursiva. Los scripts locales contienen políticas permisivas, pero no se ejecutaron ni se demuestra que estén desplegadas.

## Goals / Non-Goals

**Goals:** establecer baseline completo, historial de versiones, compatibilidad de contratos e IDs y prueba repetible de instalación/upgrade.

**Non-Goals:** diseñar todas las constraints de negocio (CHG-06), importar contraseñas, definir matriz de autorización permanente (CHG-05) o reconstruir datos desconocidos.

## Decisions

### Baseline contrastado y versionado

En implementación futura, obtener solo metadatos autorizados: columnas/tipos/nullability/defaults, PK/FK/índices, políticas, grants, vistas, funciones y versiones. Comparar con el inventario completo de tipos y queries. Una tabla ausente en SQL local se marca sin DDL local, nunca ausente remotamente. Resolver diferencias mediante un manifiesto de baseline revisado, checksum de migraciones y precondiciones; si el destino no coincide, abortar. No marcar como aplicada una versión por el mero hecho de existir una tabla.

La futura fuente será `supabase/migrations/`, con secuencia ordenada y ledger. Mantener SQL heredados como referencia obsoleta o retirarlos de la ruta documentada de instalación en la implementación, no ejecutarlos. Crear el singleton de ajustes con defaults explícitos sin sobrescribir valores existentes. Las instalaciones nuevas no crean el campo de contraseña de users; los upgrades lo mantienen inaccesible hasta su eliminación controlada en CHG-04.

Alternativas descartadas: repetir SQL manual con IF NOT EXISTS (oculta deriva) o inferir esquema únicamente de TypeScript (no refleja constraints ni permisos).

### IDs compatibles y transición acotada

Propuesta de destino: UUID generados de forma segura para nuevas entidades; preservar UUID válidos existentes y asignar una vez UUID a IDs heredados de texto mediante mapeo restringido por tabla/ID original. No hacer cast masivo de uid() a UUID. Durante expansión, agregar destino/mapeo, backfill de referencias existentes, adaptar generación/serialización del cliente y comparar referencias antes del corte. CHG-06 reutiliza esa decisión y agrega modelo relacional/constraints; no vuelve a mapear IDs.

Mantener los IDs originales como referencia de migración restringida hasta cerrar el periodo de recuperación. No resolver huérfanos inventando contrapartes ni cambiar números de documentos. Una incompatibilidad de dato detiene la contracción. Esta elección requiere aprobación antes de implementar; el contrato exige preservación, no UUID específico.

### Seguridad por defecto

Cada objeto nuevo queda cerrado a anon y sin políticas universales; la instalación antes de CHG-04/05 puede permanecer en mantenimiento. El baseline sustituye la ruta permisiva heredada y establece denegación por defecto, mientras CHG-05 incorpora la matriz permanente en versiones posteriores. Los nuevos objetos de CHG-06/07/08 se incorporarán al mismo historial y patrón restrictivo. No mezclar una migración estructural con una habilitación temporal pública.

## Risks / Trade-offs

- [Deriva real no disponible] → gate de metadatos y comparación antes de aplicar; nada aquí certifica el despliegue.
- [Clientes antiguos escriben IDs incompatibles] → ventana controlada sin tráfico antiguo al contraer, adaptación del cliente y fixtures heredadas.
- [Backfill interrumpe o rompe referencias] → lotes verificables, mapeo durable y conteos/totales antes/después, sin borrar anomalías.
- [Permisos cerrados bloquean el cliente heredado] → conservar contención y coordinar habilitación con CHG-04/05.

## Migration Plan

Después de CHG-00 y aprobación: reconciliar metadatos; establecer baseline y versiones revisadas; ensayar instalación vacía y upgrade desde fixture heredada sintética; verificar tipos/consultas de todos los recursos, singleton, IDs, conteos, referencias y totales; comprobar que reaplicar no cambie estado. Documentar recuperación de cada transformación. No hay SQL ejecutable creado durante esta planificación.

Rollback: detener tráfico; si solo se expandió, regresar al cliente compatible conservando columnas/mapeo sin remover evidencia. Si hubo contracción o transformación irreversible, restaurar en destino aislado desde respaldo probado, reconciliar escrituras posteriores y verificar permisos antes de conectar. No basta con DROP de columnas nuevas ni se recuperan políticas abiertas.

## Decisiones que requieren aprobación

UUID y ventana de compatibilidad propuesta, baseline contrastado con destino real y estrategia de recuperación de cada transformación. CHG-00 exige confirmar discrepancia del remote antes de acciones externas. No se presupone que las ocho propuestas cierren los Findings sin pruebas futuras.


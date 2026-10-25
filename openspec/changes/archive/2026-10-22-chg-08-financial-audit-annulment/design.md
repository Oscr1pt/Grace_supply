# Design

## Context

El roadmap identifica rutas que eliminan documentos y registros de gastos cuyo actor depende del cliente. El producto sigue en desarrollo y las filas actuales son pruebas descartables. No se necesita reconstruir historial ficticio. La auditoría debe proteger las operaciones reales que ocurran tras la entrega.

## Goals / Non-Goals

**Goals:** hacer atómicas y atribuibles las operaciones financieras futuras, y corregirlas con anulaciones/compensaciones trazables.

**Non-Goals:** importar snapshots de transacciones ficticias, inventar actor histórico, integrar devolución bancaria, emitir documentos fiscales o prometer resistencia a superusuarios de PostgreSQL.

## Decisions

### Auditoría de nuevas operaciones

CHG-07 produce identificadores de operación y CHG-04/05 proveen identidad/permiso verificados. Cada operación financiera futura registrará en la misma transacción actor Auth, tiempo del servidor, tipo, entidad, correlación y un snapshot mínimo permitido. El almacén de auditoría se protege contra lectura y escritura directa de roles de aplicación; el evento se agrega dentro de la operación y si falla, se revierte toda ella. No copiar perfiles, secretos ni payloads completos.

No crear eventos falsos para los datos actuales de prueba. Si se requiere una prueba de reportes, usar fixtures sintéticas identificadas como tales.

### Documentos y compensaciones

Una vez que el sistema se entregue y contabilice operaciones reales, ventas, compras, pagos y gastos confirmados no se eliminan físicamente ni se sobrescriben importes relevantes. Solo un administrador activo puede anular con motivo obligatorio, fecha de servidor e idempotencia CHG-07. La compensación conserva el original y referencias, revierte stock/saldos de forma atómica y no afirma que se devolvió dinero fuera del sistema.

Rechazar una anulación que deje stock negativo o que tenga pagos vigentes hasta que se registre una reversión autorizada y conciliada. El nominal histórico permanece; el principal vigente y los saldos reflejan compensaciones tipadas. CHG-06 define dominios y CHG-07 la transacción y locks.

### Retención y rollback

No borrar eventos automáticamente. Definir custodio y retención antes de entrega conforme a obligaciones comerciales. Las recuperaciones deben conservar eventos confirmados o reconciliarlos antes de reabrir operaciones. Una versión anterior compatible puede corregir hacia adelante; no reintroducir DELETE físico de documentos reales.

## Risks / Trade-offs

- Un evento omitido deja una operación sin traza → insertar auditoría en la misma transacción.
- Snapshot amplio puede filtrar datos → lista blanca de campos e importes, sin secretos.
- Anulación incompatible con stock o pagos → rechazar sin efectos parciales.
- Historia ficticia confundida con evidencia → no importarla; etiquetar claramente cualquier fixture de prueba.

## Migration Plan

Incorporar tabla y funciones de auditoría en migraciones CHG-03, con permisos de CHG-05 y operaciones CHG-07. Probar creación, edición permitida, fallos de auditoría, anulaciones y reintentos en Supabase local/aislado con fixtures sintéticas. No preservar las filas de prueba actuales ni ejecutar una limpieza. Para futuras operaciones reales, la salida exige trazabilidad y conciliación; ante fallo, cerrar la operación y corregir sin borrar evidencia.


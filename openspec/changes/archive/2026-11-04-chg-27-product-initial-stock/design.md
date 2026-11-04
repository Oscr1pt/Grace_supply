# Design

## Context

El catálogo crea productos mediante el flujo autorizado existente y CHG-24 protege `inventory.quantity` mediante operaciones de ajuste auditadas. La nueva existencia inicial debe conservar esas garantías sin crear compras ficticias.

## Goals / Non-Goals

**Goals:**

- Validar la existencia inicial como entero no negativo y hacer visible el resultado confirmado.
- Mantener atomicidad lógica, idempotencia, auditoría y recuperación de respuestas inciertas.
- Dejar el producto con existencia cero si el ajuste no se confirma, con una intención recuperable.

**Non-Goals:**

- No permitir PATCH directo de `quantity`.
- No crear RPC privilegiada nueva sin necesidad demostrada.
- No registrar compras, costos o movimientos financieros ficticios.

## Decisions

- Crear el producto con `quantity = 0`; solo después de recibir su UUID se envía el ajuste con motivo `Existencia inicial al registrar producto`.
- Generar una clave idempotente que vincule la intención al producto y al actor; no crear otra clave durante reconciliación.
- Mostrar existencia positiva únicamente tras confirmar el ajuste persistido; ante timeout conservar la intención y ofrecer reconciliación.
- Reutilizar `postBusinessOperation` y los helpers de CHG-24 para autorización, conflicto de concurrencia y auditoría.
- Mantener el formulario recuperable si la creación o el ajuste falla.

## Risks / Trade-offs

- [Riesgo] Producto creado y ajuste incierto → [Mitigación] conservar producto en cero y la intención pendiente hasta resolverla.
- [Riesgo] Doble clic durante la creación → [Mitigación] bloquear el envío y reutilizar la misma clave idempotente.
- [Riesgo] Confusión entre ajuste inicial y ajuste posterior → [Mitigación] motivo fijo y flujo de UI separado.

## Migration Plan

No crear migración salvo que la auditoría actual no pueda almacenar el motivo ya exigido por CHG-24. Verificar primero el esquema local y la RPC existente; nunca editar migraciones históricas ni ejecutar `supabase db push` contra Cloud sin revisar pendientes.

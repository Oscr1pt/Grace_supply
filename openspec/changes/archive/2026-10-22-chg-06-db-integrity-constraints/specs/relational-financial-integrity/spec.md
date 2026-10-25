# Spec Delta

## Purpose

Exigir integridad relacional, monetaria y de inventario en el esquema limpio de Grace Supply y mantener el contrato alineado con PostgreSQL.

## ADDED Requirements

### Requirement: Relaciones referenciales tipadas

Los documentos y movimientos MUST usar UUID y claves foráneas que representen sus relaciones. Pagos MUST apuntar a exactamente un crédito de cliente o proveedor mediante referencia tipada.

#### Scenario: Pago sin crédito tipado válido

- **WHEN** se intenta crear un pago sin exactamente una referencia válida y un tipo coincidente
- **THEN** PostgreSQL rechaza la operación.

#### Scenario: Compra descriptiva

- **WHEN** se registra una compra descriptiva sin artículo de inventario
- **THEN** item_id puede ser nulo; las relaciones y reglas de proveedor/crédito siguen validadas.

### Requirement: Líneas y snapshots de documentos

Las líneas de venta MUST tener relación verificable con venta e inventario y conservar el precio aplicado cuando se contabiliza.

#### Scenario: Cambio de precio del catálogo

- **WHEN** el precio del artículo cambia después de una venta
- **THEN** la línea y el total del documento conservan el precio aplicado originalmente.

### Requirement: Dominios monetarios y de inventario

Importes MUST usar NUMERIC(14,2) y cantidades enteras válidas, con CHECK que impidan importes no válidos, stock negativo y saldos incoherentes. La moneda inicial SHALL ser DOP salvo justificación documentada. Las reglas tributarias permanecen pendientes de decisión del negocio.

#### Scenario: Valor inválido

- **WHEN** cualquier ruta intenta escribir un monto fuera de dominio, cantidad no positiva o stock negativo
- **THEN** PostgreSQL rechaza el cambio.

### Requirement: Restricciones únicas y consultables

Los números internos y relaciones que deban ser únicas MUST tener restricciones UNIQUE y las relaciones consultadas MUST tener índices justificados.

#### Scenario: Duplicado concurrente

- **WHEN** dos operaciones intentan crear el mismo número único
- **THEN** solo una queda persistida y la otra recibe un conflicto recuperable.

### Requirement: Bootstrap limpio sin migración histórica

Las migraciones MUST crear el esquema completo desde una base vacía y MUST NOT requerir backfill, mapeo o conciliación de filas de prueba.

#### Scenario: Datos reales inesperados

- **WHEN** el destino de desarrollo contiene datos que no son claramente sintéticos
- **THEN** cualquier transformación o eliminación se detiene y requiere autorización explícita.


# Spec Delta

## ADDED Requirements

### Requirement: Clasificación tributaria aplicada por producto
El servidor SHALL usar la clasificación confirmada de cada producto para calcular ventas: `gravado` aplica 18% únicamente cuando ITBIS está activado, `exento` aplica cero y `pendiente` bloquea la confirmación cuando el modo está activado.

#### Scenario: Venta gravada con ITBIS activo
- **WHEN** una venta autorizada contiene un producto `gravado` y la política V1 está activa
- **THEN** PostgreSQL calcula 18% sobre la línea y la UI muestra el mismo impuesto antes de confirmar.

#### Scenario: Venta exenta con ITBIS activo
- **WHEN** una venta autorizada contiene un producto `exento` y la política V1 está activa
- **THEN** la línea conserva impuesto cero y no aumenta el total por ITBIS.

#### Scenario: Producto pendiente
- **WHEN** una venta contiene un producto `pendiente` con ITBIS activo
- **THEN** la UI muestra una advertencia específica de clasificación y PostgreSQL rechaza la venta sin efectos financieros ni de inventario.

#### Scenario: ITBIS desactivado
- **WHEN** la política V1 está guardada con ITBIS desactivado
- **THEN** productos gravados y exentos se venden sin impuesto y el recibo conserva subtotal y total base.

### Requirement: Errores tributarios distinguibles
La aplicación MUST distinguir un bloqueo de política tributaria (`financial_tax_policy_pending`) de un producto sin clasificación (`tax_classification_pending`) y no presentar ambos como una aprobación pendiente genérica.

#### Scenario: Política pendiente
- **WHEN** PostgreSQL rechaza una venta porque la configuración tributaria no está aprobada o soportada
- **THEN** la UI indica que debe revisarse la configuración tributaria, sin atribuirlo al producto.

#### Scenario: Clasificación pendiente
- **WHEN** PostgreSQL rechaza una venta por un producto `pendiente`
- **THEN** la UI identifica el producto sin clasificar y permite corregir su clasificación mediante el flujo autorizado.

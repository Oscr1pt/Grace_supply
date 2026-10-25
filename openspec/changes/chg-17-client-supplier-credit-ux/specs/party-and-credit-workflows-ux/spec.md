# Spec Delta — party-and-credit-workflows-ux

## Purpose
Clientes, proveedores y cuentas de crédito. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## ADDED Requirements

### Requirement: Ficha comercial y estado legibles
Clientes y proveedores SHALL mostrar datos, estado y acciones accesibles sin inducir a borrar historial relacionado.

#### Scenario: Se desactiva un proveedor con compras previas
- **WHEN** se desactiva un proveedor con compras previas
- **THEN** sus comprobantes conservan referencias y el estado se muestra en su ficha.

### Requirement: Pago con persistencia confirmada
El flujo de créditos MUST diferenciar pago confirmado, pendiente de reconciliación y rechazado, sin duplicar movimientos.

#### Scenario: Se pierde la respuesta del servidor al pagar un crédito
- **WHEN** se pierde la respuesta del servidor al pagar un crédito
- **THEN** se preserva el contexto y se consulta la operación por clave, sin activar otra contabilización.

### Requirement: Permisos visibles y efectivos
Los controles de consulta y edición MUST concordar con el rol y los permisos efectivos del servidor.

#### Scenario: Empleado sin permiso de proveedores accede por URL
- **WHEN** empleado sin permiso de proveedores accede por URL
- **THEN** no ve datos privados ni puede modificar la ficha desde la UI o la API.

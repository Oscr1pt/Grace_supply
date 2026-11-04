# Spec Delta

## MODIFIED Requirements

### Requirement: Productos definidos por el cliente
El catálogo SHALL permitir que usuarios autorizados creen productos con nombre, SKU, descripción opcional, precio, costo y una existencia inicial entera no negativa, sin depender de productos precargados. La existencia inicial SHALL confirmarse mediante la operación de inventario autorizada.

#### Scenario: Catálogo inicialmente vacío
- **WHEN** no existe ningún producto y un usuario autorizado registra uno con existencia cero
- **THEN** se crea el producto con existencia confirmada cero y puede utilizarse después en flujos autorizados.

#### Scenario: Producto con existencia inicial positiva
- **WHEN** un usuario autorizado registra un producto con una cantidad entera positiva
- **THEN** el producto se crea primero con cero y la existencia positiva solo se muestra después de confirmar un ajuste auditado.

#### Scenario: Existencia inválida
- **WHEN** se introduce una cantidad negativa, decimal, vacía o fuera de los límites admitidos
- **THEN** la UI rechaza el valor y no crea producto ni movimiento de stock.

### Requirement: Integridad y compatibilidad financiera
La evolución de inventory MUST preservar referencias, importes, inventario auditado, permisos y documentos históricos.

#### Scenario: Producto referenciado en una venta anterior
- **WHEN** se modifica el contrato del producto
- **THEN** se conserva su UUID y la venta histórica mantiene sus importes y líneas originales.

#### Scenario: Escritura no autorizada de stock
- **WHEN** un usuario intenta variar existencias sin la operación permitida
- **THEN** RLS/RPC rechaza la operación y no se modifica inventario.

#### Scenario: Falla después de crear el producto
- **WHEN** el ajuste inicial falla o queda incierto
- **THEN** el producto permanece con existencia cero, la intención queda recuperable y no se registra una compra ficticia.

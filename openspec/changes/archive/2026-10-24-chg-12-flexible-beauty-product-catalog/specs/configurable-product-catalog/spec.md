# Spec Delta

## ADDED Requirements

### Requirement: Productos definidos por el cliente
El catálogo SHALL permitir que usuarios autorizados creen productos con nombre, SKU, descripción opcional, precio y costo validados, sin depender de productos precargados.

#### Scenario: Catálogo inicialmente vacío
- **WHEN** no existe ningún producto
- **THEN** la aplicación puede crear uno nuevo y utilizarlo después en ventas y compras autorizadas.

### Requirement: Clasificación flexible
El catálogo MUST admitir categorías definidas por el negocio y atributos neutros relevantes para productos de barbería y belleza sin enumeraciones heredadas de joyería.

#### Scenario: Categoría no prevista inicialmente
- **WHEN** un usuario autorizado registra una categoría nueva
- **THEN** puede clasificar productos sin modificar código ni migraciones.

### Requirement: Integridad y compatibilidad financiera
La evolución de inventory MUST preservar referencias, importes, inventario auditado, permisos y documentos históricos.

#### Scenario: Producto referenciado en una venta anterior
- **WHEN** se modifica el contrato del producto
- **THEN** se conserva su UUID y la venta histórica mantiene sus importes y líneas originales.

#### Scenario: Escritura no autorizada de stock
- **WHEN** un usuario intenta variar existencias sin la operación permitida
- **THEN** RLS/RPC rechaza la operación y no se modifica inventario.

### Requirement: Migración sin destrucción implícita
El sistema MUST implementar cambios de esquema como nuevas migraciones verificables, sin reescribir las aplicadas.

#### Scenario: Datos legados encontrados
- **WHEN** la migración detecta información de joyería u otras columnas obsoletas
- **THEN** preserva el contenido de negocio y reporta conversiones pendientes en lugar de borrarlo silenciosamente.

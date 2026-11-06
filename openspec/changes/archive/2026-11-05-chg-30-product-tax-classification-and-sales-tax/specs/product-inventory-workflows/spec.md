# Spec Delta

## ADDED Requirements

### Requirement: Clasificación tributaria de producto autorizada
El sistema SHALL conservar `pendiente` como clasificación inicial y permitir que solo un administrador activo con permiso `inventory` confirme `gravado`, `exento` o `pendiente` mediante una operación de servidor auditable.

#### Scenario: Administrador clasifica producto
- **WHEN** un administrador activo guarda una clasificación válida para un producto nuevo o existente
- **THEN** PostgreSQL persiste el valor y registra actor, fecha, producto y valores anterior/nuevo.

#### Scenario: Usuario sin autorización
- **WHEN** un usuario sin permiso `inventory` intenta cambiar `tax_classification` por UI o REST
- **THEN** la operación es rechazada y no modifica ninguna columna del producto.

#### Scenario: Valor inválido
- **WHEN** una solicitud envía una clasificación distinta de `gravado`, `exento` o `pendiente`
- **THEN** PostgreSQL rechaza la solicitud sin cambiar el producto ni crear auditoría de éxito.

### Requirement: Separación de campos protegidos
La operación de clasificación MUST no conceder actualización general de `inventory` ni permitir cambios directos de `quantity`, precio, SKU u otros campos protegidos.

#### Scenario: REST directo
- **WHEN** un cliente intenta actualizar `tax_classification` o `quantity` directamente sin la operación autorizada
- **THEN** RLS o el guard del servidor rechaza la solicitud y la existencia permanece intacta.

#### Scenario: Fallo recuperable
- **WHEN** falla la persistencia de la clasificación
- **THEN** el formulario conserva sus valores y no anuncia una clasificación confirmada.

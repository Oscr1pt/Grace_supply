# Product Inventory Workflows Specification

## Purpose

Provides a neutral, configurable product catalog and keeps product selection, stock, labels, and documents consistent with Grace Supply's authorized commercial workflows.

## Requirements

### Requirement: Formulario de inventario neutro
La aplicación SHALL presentar campos de producto de comercio general, sin exigir ni mostrar terminología o campos específicos de joyería.

#### Scenario: Registrar un producto de barbería
- **WHEN** un usuario autorizado crea una máquina, champú, navaja o cualquier otro producto
- **THEN** completa nombre, código, categoría propia y precios usando campos comprensibles sin conocer joyería.

### Requirement: Selección del catálogo en documentos
Ventas y compras MUST seleccionar productos existentes mediante su identidad estable y preservar importe y descripción confirmados de cada documento.

#### Scenario: Factura con producto nuevo
- **WHEN** se crea un producto y después se intenta agregar a factura
- **THEN** el selector muestra el producto y el flujo respeta sus permisos, stock y políticas tributarias.

### Requirement: Etiquetas comerciales coherentes
Las etiquetas de productos SHALL mostrar información comercial autorizada y MUST NOT generar referencias a piedras, quilates o metales salvo que figuren explícitamente en un nombre libre proporcionado por el cliente.

#### Scenario: Imprimir etiqueta
- **WHEN** se imprime el SKU de un consumible
- **THEN** la etiqueta muestra nombre/código, presentación opcional y precio configurado, sin datos gemológicos inferidos.

### Requirement: Errores y operaciones seguras
La UI MUST conservar entrada recuperable cuando una escritura falla y MUST NOT crear, eliminar o ajustar stock fuera de las operaciones autorizadas.

#### Scenario: Escritura denegada
- **WHEN** RLS o RPC deniega guardar un producto
- **THEN** el formulario conserva su entrada y no anuncia éxito ni altera caché confirmada.

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

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

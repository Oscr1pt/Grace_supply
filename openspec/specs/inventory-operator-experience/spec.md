# inventory-operator-experience Specification

## Purpose

Inventario cotidiano, categorías y etiquetas. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## Requirements

### Requirement: Formulario comprendido por operadores
La creación y edición de productos SHALL tener etiquetas, restricciones y errores por campo comprensibles, preservando el borrador tras rechazo.

#### Scenario: Se intenta guardar SKU existente o atributos no válidos
- **WHEN** se intenta guardar SKU existente o atributos no válidos
- **THEN** el error es específico y el usuario puede corregir sin volver a introducir el resto de los datos.

### Requirement: Catálogo y estado operativos
La búsqueda y los estados de producto MUST conservar identidad y no permitir que un producto inactivo parezca seleccionable para nuevas operaciones.

#### Scenario: Se desactiva un producto con historial
- **WHEN** se desactiva un producto con historial
- **THEN** permanece consultable para auditoría, pero se identifica su estado y se excluye de acciones nuevas que lo requieran.

### Requirement: Vista previa fiel a etiquetas confirmadas
La impresión SHALL reflejar la configuración guardada o indicar explícitamente cuando hay cambios pendientes.

#### Scenario: Falla el guardado del tamaño de etiqueta
- **WHEN** falla el guardado del tamaño de etiqueta
- **THEN** no se muestra éxito, se conserva la selección para corregir y la impresión no promete aplicar parámetros no confirmados.

### Requirement: Selector tributario comprensible
El formulario de Inventario SHALL mostrar un selector accesible para `Gravado`, `Exento` y `Pendiente`, con `Pendiente` seleccionado por defecto y mensajes claros sobre el efecto en ventas.

#### Scenario: Producto nuevo
- **WHEN** un operador autorizado abre el formulario de creación
- **THEN** la clasificación inicial es `Pendiente` y el usuario puede guardar el producto sin habilitar cobros tributarios implícitos.

#### Scenario: Cambio de clasificación
- **WHEN** un administrador confirma una nueva clasificación
- **THEN** la pantalla muestra el estado guardado después de la respuesta del servidor y lo conserva tras recargar.

#### Scenario: Error de autorización
- **WHEN** el servidor deniega la clasificación
- **THEN** se muestra un mensaje de permisos, se conserva el borrador y no se actualiza la caché confirmada.

### Requirement: Vista previa fiscal fiel
La vista previa de Ventas SHALL aplicar la misma clasificación y redondeo que el servidor, mostrando impuesto cero cuando ITBIS está desactivado o la línea es exenta.

#### Scenario: Venta mixta
- **WHEN** una cotización contiene líneas gravadas y exentas con ITBIS activo
- **THEN** la vista previa suma impuesto solo sobre las líneas gravadas y coincide con el total confirmado por PostgreSQL.

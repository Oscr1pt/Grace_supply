# Spec Delta

## ADDED Requirements

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

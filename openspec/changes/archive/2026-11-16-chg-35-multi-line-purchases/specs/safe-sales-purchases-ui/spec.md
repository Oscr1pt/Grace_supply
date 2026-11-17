# Spec Delta

## ADDED Requirements

### Requirement: Una compra admite varias líneas de productos

El formulario SHALL permitir añadir, editar y quitar líneas vinculadas al inventario o manuales, cada una con cantidad, costo unitario y subtotal, mostrar un total general y confirmar todo como una sola compra con el proveedor, factura y pago existentes. Las líneas manuales SHALL solicitar solo nombre/descripción del producto, SHALL identificarse claramente como no registradas y SHALL no crear productos ni afectar existencias.

#### Scenario: Se agregan varios productos

- **WHEN** el usuario compone una compra con productos distintos y cantidades/costos válidos
- **THEN** ve el subtotal de cada línea y un total general, y la confirmación genera un único documento.

#### Scenario: Compra con varias líneas manuales

- **WHEN** el usuario agrega varios productos no registrados con nombre, cantidad y costo
- **THEN** cada línea se distingue del inventario, muestra su subtotal y se guarda sin crear productos ni modificar existencias.

#### Scenario: Compra mixta

- **WHEN** el usuario combina líneas manuales y productos vinculados y activa reposición
- **THEN** las líneas manuales y vinculadas aparecen diferenciadas, solo las vinculadas reponen inventario y el total suma ambos tipos.

#### Scenario: Nombre de producto manual requerido

- **WHEN** el nombre manual está vacío, solo contiene espacio ASCII, tabulación, LF, VT, FF o CR, tiene uno de esos blancos en un extremo o excede 500 caracteres
- **THEN** el formulario muestra el error de la línea y conserva el resto del borrador sin enviar la compra.

#### Scenario: Se repite un producto

- **WHEN** el usuario intenta añadir un producto que ya aparece en otra línea
- **THEN** la interfaz evita o identifica el duplicado antes del envío y el servidor conserva su rechazo autoritativo.

#### Scenario: Compra legado sin producto vinculado

- **WHEN** se registra una compra sencilla descrita sin producto vinculado y sin reposición
- **THEN** sigue disponible la opción de compra legado sin inventar una línea de inventario.

#### Scenario: Compra a crédito con múltiples líneas

- **WHEN** la compra a crédito es válida
- **THEN** la interfaz muestra un solo proveedor activo, factura y cuenta por pagar correspondiente al total completo.

### Requirement: El historial presenta detalles de compras multilínea sin alterar documentos legados

El historial SHALL mostrar el total y la composición confirmada de compras nuevas, diferenciar líneas vinculadas de manuales, conservar búsqueda y paginación CHG-33, y mostrar las compras antiguas desde sus datos históricos escalares sin reconstruir snapshots ausentes ni presentar productos manuales como inventario.

#### Scenario: Consulta del detalle de una compra multilínea

- **WHEN** un usuario con permiso de compras abre los detalles de una compra nueva
- **THEN** ve las líneas y snapshots persistidos bajo la misma autorización y RLS de lectura de compras.

#### Scenario: Consulta del detalle de compra manual o mixta

- **WHEN** un usuario autorizado abre una compra con líneas manuales y vinculadas
- **THEN** cada línea muestra su nombre, cantidad, costo y subtotal, las manuales se etiquetan como no registradas y no muestran un SKU ficticio.

#### Scenario: Consulta de una compra histórica simple

- **WHEN** se abre una compra anterior a la estructura de líneas
- **THEN** la pantalla usa sus campos legados sin alterar el registro ni inventar nombres de productos o costos.

#### Scenario: Búsqueda y anulación desde el historial

- **WHEN** se busca o pagina una compra y luego se anula con autorización
- **THEN** la búsqueda, total, detalle y estado del mismo documento siguen coherentes y la anulación conserva su confirmación y errores existentes.

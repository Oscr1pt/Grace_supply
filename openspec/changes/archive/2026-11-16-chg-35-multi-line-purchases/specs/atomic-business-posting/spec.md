# Spec Delta

## ADDED Requirements

### Requirement: Compra multilínea atómica e idempotente

Una compra SHALL aceptar líneas vinculadas y manuales en una sola operación autorizada. PostgreSQL SHALL calcular los importes y reponer solo las líneas vinculadas seleccionadas. Cada línea manual SHALL guardar nombre histórico, `item_id = NULL` y `restocked = false`, sin crear productos ni cambiar existencias. Un reintento con la misma clave SHALL devolver el resultado persistido.

#### Scenario: Compra de varios productos al contado con reposición

- **WHEN** un usuario autorizado contabiliza líneas válidas de productos activos con reposición habilitada
- **THEN** un único documento conserva el snapshot de cada línea, el total equivale a la suma de subtotales y cada existencia aumenta exactamente por su cantidad en la misma transacción.

#### Scenario: Compra con varias líneas manuales

- **WHEN** un usuario autorizado registra dos o más líneas manuales con nombres válidos
- **THEN** se guarda un único documento con snapshots, cantidades, costos y subtotales de servidor, sin crear productos ni modificar existencias.

#### Scenario: Compra mixta con reposición habilitada

- **WHEN** una compra contiene líneas vinculadas y manuales con reposición habilitada
- **THEN** solo aumentan las existencias de las líneas vinculadas, las líneas manuales quedan con `item_id = NULL` y `restocked = false`, y el total incluye todas las líneas.

#### Scenario: Líneas manuales con nombres repetidos

- **WHEN** una compra incluye líneas manuales distintas con el mismo nombre
- **THEN** ambas se conservan como líneas independientes y ninguna se asocia al inventario.

#### Scenario: Nombre manual inválido

- **WHEN** una línea manual tiene nombre vacío, solo contiene espacio ASCII, tabulación, LF, VT, FF o CR, tiene uno de esos blancos en un extremo o supera 500 caracteres
- **THEN** PostgreSQL rechaza toda la compra sin crear documentos, créditos, líneas ni efectos de inventario.

#### Scenario: Nombre manual conserva el texto exacto

- **WHEN** una línea manual tiene un nombre válido de hasta 500 caracteres con espacios internos
- **THEN** PostgreSQL conserva exactamente la cadena validada en el snapshot, sin normalizarla respecto del payload con huella de idempotencia.

#### Scenario: Compra multilínea a crédito

- **WHEN** una compra tiene proveedor activo, factura válida y varias líneas válidas
- **THEN** se crea un documento y una sola cuenta por pagar por el total completo, o ningún efecto si falla una parte.

#### Scenario: Producto vinculado duplicado

- **WHEN** la solicitud contiene el mismo producto de inventario en más de una línea
- **THEN** se rechaza la operación sin documento, crédito ni cambios de existencias.

#### Scenario: Cantidad o costo inválido

- **WHEN** cualquier línea tiene cantidad no entera o no positiva, costo negativo, precisión monetaria inválida o excede el límite financiero
- **THEN** se rechaza el documento completo sin efectos parciales.

#### Scenario: Se excede el máximo total de líneas por documento

- **WHEN** la solicitud supera 100 líneas
- **THEN** se rechaza antes de modificar documentos, créditos o inventario.

#### Scenario: Reintento de respuesta incierta

- **WHEN** se reenvía el mismo payload multilínea con la misma identidad idempotente
- **THEN** se devuelven los identificadores y el total confirmados sin insertar líneas, créditos o movimientos de stock adicionales.

### Requirement: Solicitud de compra legado compatible

El contrato de compra simple SHALL seguir aceptándose y conservar su resultado observable, incluidas las compras sin producto vinculado cuando no solicitan reposición; el nuevo contrato multilínea SHALL admitir líneas manuales y mixtas sin cambiar ese payload anterior.

#### Scenario: Cliente anterior envía una compra simple

- **WHEN** un cliente existente llama con un producto opcional, cantidad, costo y campos actuales
- **THEN** se confirma una compra simple conforme a las validaciones, pagos e idempotencia existentes.

#### Scenario: Compra sencilla sin artículo vinculado

- **WHEN** se registra una compra descrita sin producto vinculado y sin reponer existencias
- **THEN** se conserva un único documento y su total sin inventar una asociación de inventario.

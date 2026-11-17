# atomic-business-posting Specification

## Purpose
Contabilizar ventas, compras, créditos, pagos y movimientos de inventario de forma indivisible, autorizada y segura ante concurrencia y reintentos.

## Requirements

### Requirement: Operación de negocio indivisible
Cada venta, compra, creación de crédito, pago y ajuste relacionado SHALL confirmar todos sus efectos en una sola transacción de base o ninguno.

#### Scenario: Fallo intermedio en venta a crédito
- **WHEN** falla la creación del documento, líneas, descuento de stock o crédito
- **THEN** no persiste ninguno de esos efectos y no se anuncia éxito.

#### Scenario: Compra con reposición
- **WHEN** una compra incluye stock y cuenta por pagar
- **THEN** el documento, incremento de stock y crédito se confirman juntos o todos se revierten.

### Requirement: Autorización de cada operación
Cada operación MUST verificar identidad, cuenta activa, permiso y alcance vigente antes de devolver información o realizar efectos, incluso al recuperar un resultado previo.

#### Scenario: Actor o totales adulterados
- **WHEN** el cliente envía otro actor, rol, saldo o totales calculados como autoridad
- **THEN** se rechazan o ignoran esos campos como autoridad y se deriva identidad y cálculo desde fuentes de servidor autorizadas.

### Requirement: Stock seguro bajo concurrencia
El sistema SHALL validar y modificar stock contra el valor vigente en la base, sin sobreventa ni pérdida de incrementos concurrentes.

#### Scenario: Dos ventas de la última unidad
- **WHEN** dos operaciones distintas intentan vender simultáneamente la única unidad disponible
- **THEN** exactamente una confirma y la otra falla sin documento, crédito ni stock parcial.

#### Scenario: Cantidad mayor a stock
- **WHEN** una venta solicita más unidades que las disponibles
- **THEN** se rechaza toda la venta sin ajustar artificialmente el stock a cero.

### Requirement: Cálculo financiero de servidor
El sistema MUST calcular importes y saldos con precisión decimal y la política aprobada, preservando los valores de contabilización aunque cambien precios o impuestos después.

#### Scenario: Cambio de precio o tasa
- **WHEN** el valor vigente difiere de la cotización confirmada por el usuario
- **THEN** se informa conflicto para nueva confirmación y no se contabiliza silenciosamente otro total.

### Requirement: Pagos conciliados sin sobrepago
Registrar un pago SHALL insertar el movimiento y actualizar el crédito correspondiente juntos, usando saldo bloqueado vigente y sin permitir sobrepago.

#### Scenario: Dos abonos que excederían saldo
- **WHEN** dos pagos distintos compiten por el saldo restante
- **THEN** solo confirman los compatibles con ese saldo y el resto falla sin crear pagos parciales; pagado y saldo coinciden con los pagos válidos.

### Requirement: Idempotencia durable y aislada
Repetir una operación con el mismo actor, tipo, clave y contenido SHALL devolver su resultado confirmado sin repetir efectos; cambiar el contenido con la misma clave MUST producir conflicto.

#### Scenario: Respuesta perdida tras commit
- **WHEN** el cliente reintenta con la misma clave después de no recibir respuesta
- **THEN** obtiene los mismos identificadores y totales sin otra venta, pago, crédito o movimiento de stock.

#### Scenario: Clave reutilizada con otro contenido
- **WHEN** la misma clave se presenta con distinto importe, líneas o destino
- **THEN** la operación se rechaza sin cambios ni exposición de resultados ajenos.

### Requirement: Resultado confirmado y recuperación identificable
La respuesta SHALL identificar la operación persistida y sus resultados canónicos; un error o estado incierto MUST seguir el contrato de CHG-01 sin repetición ciega ni acceso directo alternativo.

#### Scenario: Timeout antes de conocer el resultado
- **WHEN** el cliente no sabe si hubo commit
- **THEN** consulta o reintenta con la misma identidad de operación y mantiene la confirmación pendiente hasta reconciliar.

### Requirement: Totales monetarios autorizados en servidor
PostgreSQL o un servidor confiable SHALL calcular los importes autorizados con decimal y redondeo comercial uniforme; el total enviado por navegador MUST NOT ser autoridad. La moneda principal SHALL ser DOP y los importes NUMERIC(14,2), salvo justificación documentada del análisis del esquema. Cada línea SHALL conservar el precio aplicado. La política de impuestos y si los precios los incluyen MUST permanecer pendiente hasta aprobación del negocio.

#### Scenario: Cliente altera el total
- **WHEN** el cliente envía subtotal, impuesto o total distinto al resultado autorizado en servidor
- **THEN** el servidor recalcula o rechaza la operación y no contabiliza el total manipulado.

#### Scenario: Parámetros tributarios sin aprobar
- **WHEN** una operación requiere tasa o modalidad tributaria todavía no aprobada
- **THEN** el sistema no inventa un dato fiscal y no contabiliza hasta contar con configuración autorizada.

### Requirement: Retención controlada de claves de idempotencia
Las claves de idempotencia SHALL persistir en PostgreSQL con identidad, tipo y contenido canónico; no se eliminarán automáticamente. 90 días es una propuesta inicial para evaluación y MUST quedar sujeta a pruebas y aprobación explícita.

#### Scenario: Clave expirada candidata
- **WHEN** una clave supera la retención candidata de 90 días y existe incertidumbre de un efecto financiero asociado
- **THEN** no se purga ni se permite repetir el efecto hasta que una política aprobada y reconciliación demuestren que es seguro.

### Requirement: Ventas al contado con cliente ocasional
Una venta SHALL poder registrar una contraparte ocasional mediante un nombre capturado en el documento, sin crear una ficha de cliente ni asociarla por coincidencia de nombre; el servidor SHALL mantener la política financiera vigente.

#### Scenario: Venta al contado con cliente ocasional
- **WHEN** un usuario autorizado confirma una venta al contado con nombre ocasional válido
- **THEN** la operación conserva ese nombre en el documento, no crea una fila en `clients` y contabiliza líneas, ITBIS, inventario e idempotencia según los contratos vigentes.

#### Scenario: Nombre igual a un cliente registrado
- **WHEN** el nombre ocasional coincide con el de uno o más clientes registrados
- **THEN** la venta sigue sin `client_id` y no se vincula automáticamente con ninguno de ellos.

#### Scenario: Cliente ocasional intenta comprar a crédito
- **WHEN** se envía una venta a crédito sin UUID de un cliente activo
- **THEN** PostgreSQL rechaza la operación completa y no crea venta, crédito ni movimientos de inventario.

#### Scenario: Falta el nombre ocasional
- **WHEN** se solicita venta ocasional con nombre vacío después de recortar espacios
- **THEN** la operación se rechaza antes de cualquier efecto persistido.

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

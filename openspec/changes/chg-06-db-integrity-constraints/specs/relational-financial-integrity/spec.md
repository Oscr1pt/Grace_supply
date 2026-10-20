# Spec Delta

## Purpose

Exigir integridad de referencias, valores financieros e inventario en PostgreSQL y conservar la compatibilidad del historial al migrar.

## ADDED Requirements

### Requirement: Referencias relacionales válidas
La base SHALL rechazar referencias a clientes, proveedores, artículos, documentos o créditos inexistentes y MUST impedir que borrar una contraparte destruya historial financiero.

#### Scenario: Documento huérfano
- **WHEN** se intenta guardar una venta con cliente o línea de artículo inexistente
- **THEN** PostgreSQL rechaza el cambio completo por integridad referencial.

#### Scenario: Contraparte con historial
- **WHEN** se intenta eliminar un cliente, proveedor o artículo referenciado
- **THEN** se impide el borrado destructivo y el historial conserva identidad y referencias.

### Requirement: Pago asociado a un único crédito del tipo correcto
Cada pago MUST referenciar exactamente un crédito existente del tipo declarado y SHALL quedar protegido contra referencias ambiguas o huérfanas.

#### Scenario: Referencia polimórfica inválida
- **WHEN** se intenta registrar un pago sin crédito, con ambos tipos o con tipo distinto del crédito destino
- **THEN** PostgreSQL rechaza el pago.

### Requirement: Valores monetarios y cantidades válidos
La base MUST rechazar valores no finitos, importes fuera del dominio aprobado, cantidades de operación no positivas, stock negativo y tasas fuera del rango permitido; los importes SHALL conservar precisión decimal.

#### Scenario: Valores financieros inválidos
- **WHEN** se intenta guardar pago o gasto no positivo, precio negativo, stock negativo, cantidad fraccionaria no admitida o importe no finito
- **THEN** PostgreSQL rechaza la escritura sin depender de validaciones del navegador.

### Requirement: Consistencia interna de créditos
Cada crédito SHALL conservar total nominal positivo, pagado neto entre cero y principal vigente, saldo igual a principal vigente menos pagado neto y estado coherente. El principal vigente es el nominal menos compensaciones autorizadas; sin compensaciones equivale al total nominal.

#### Scenario: Saldo inconsistente
- **WHEN** se intenta guardar un crédito sin compensaciones con saldo negativo, pagado mayor al total o saldo distinto de total menos pagado
- **THEN** PostgreSQL rechaza la fila.

### Requirement: Unicidad de identificadores comerciales
La base MUST impedir SKU duplicado, número de recibo duplicado y número de factura de proveedor duplicado dentro de su ámbito aprobado, además de más de un crédito del mismo tipo para el mismo documento.

#### Scenario: Repetición de documento o crédito
- **WHEN** se intenta insertar un segundo recibo con el mismo número o un segundo crédito para la misma venta
- **THEN** PostgreSQL rechaza la colisión.

#### Scenario: Misma factura de proveedores distintos
- **WHEN** dos proveedores distintos tienen el mismo número externo de factura
- **THEN** no se confunden sus documentos y la unicidad se evalúa dentro del proveedor identificado.

### Requirement: Migración conservadora de anomalías
La migración MUST preservar identidades, documentos, referencias y totales, y MUST detener su corte si existen anomalías que no permiten validar las restricciones sin una resolución aprobada.

#### Scenario: Huérfano o duplicado histórico
- **WHEN** se detecta una anomalía en la fixture de actualización
- **THEN** se documenta de forma restringida y no se borra, fusiona ni altera financieramente para forzar la validación.


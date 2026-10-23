# verified-persistence Specification

## Purpose

Evitar confirmaciones fantasma de cambios al exigir evidencia de persistencia remota y errores visibles en todos los flujos de escritura.

## Requirements

### Requirement: Confirmación verificable por escritura
El sistema SHALL anunciar éxito solo cuando el servicio confirme la operación, sin error y con identidad y cantidad de registros esperadas; una respuesta sin error pero sin filas afectadas MUST tratarse como no confirmada.

#### Scenario: Actualización sin coincidencias
- **WHEN** una actualización o eliminación afecta cero registros, incluso por RLS o un ID inexistente
- **THEN** se informa que no fue confirmada y no se anuncia éxito ni se cambia la copia local confirmada.

#### Scenario: Inserción confirmada
- **WHEN** una inserción devuelve el registro persistido con el identificador esperado
- **THEN** se actualiza el estado confirmado y se permite la confirmación visual.

### Requirement: Errores recuperables sin pérdida de entrada
El sistema SHALL esperar el resultado de guardar ajustes, empleados, ventas, compras, créditos, pagos, gastos y catálogos, y MUST conservar la entrada recuperable si falla.

#### Scenario: Error de servicio
- **WHEN** el servicio devuelve denegación de permiso, validación o fallo de escritura
- **THEN** se muestra un error comprensible sin datos sensibles, el formulario permanece recuperable y no se emite recibo ni éxito.

#### Scenario: Guardado pendiente de empleado o ajustes
- **WHEN** la solicitud aún no finaliza
- **THEN** el control indica estado pendiente y no cierra el formulario ni anuncia guardado.

### Requirement: El almacenamiento local no confirma persistencia remota
El sistema MUST distinguir datos confirmados de entrada o lecturas obsoletas, y MUST NOT convertir una escritura rechazada o desconectada en éxito mediante almacenamiento local.

#### Scenario: Navegador desconectado
- **WHEN** se intenta guardar sin conexión
- **THEN** no se crea una entidad aparentemente persistida en estado/caché y la entrada se conserva como no guardada.

#### Scenario: Lectura remota fallida
- **WHEN** no se puede actualizar la lectura
- **THEN** cualquier dato previamente mostrado se identifica como no actualizado y no se usa como prueba de que una escritura nueva persistió.

### Requirement: Resultado incierto sin repetición ciega
El sistema SHALL identificar como incierta una escritura cuya respuesta se pierde y MUST exigir reconciliación antes de anunciar éxito o repetir una mutación no idempotente.

#### Scenario: Timeout después de enviar
- **WHEN** la conexión se interrumpe sin poder determinar si hubo commit
- **THEN** se muestra estado pendiente de verificar y se consulta por identidad estable o clave de operación; no se genera automáticamente otra venta o pago.

### Requirement: Éxito de operación compuesta solo al completarse
El sistema MUST NOT anunciar que una venta, compra o pago está completo si alguno de sus efectos requeridos falla; la persistencia individual no equivale a atomicidad.

#### Scenario: Venta con fallo de creación de crédito
- **WHEN** el documento persiste pero falla un efecto requerido
- **THEN** no se emite confirmación de operación completa y se indica necesidad de reconciliación sin afirmar que hubo rollback global.

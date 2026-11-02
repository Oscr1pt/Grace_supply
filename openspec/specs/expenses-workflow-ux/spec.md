# expenses-workflow-ux Specification

## Purpose

Registro, consulta y anulación de gastos operativos comprensibles y seguros, preservando autorizaciones y evidencia financiera existente.

## Requirements

### Requirement: Captura válida y confirmación persistente

La interfaz SHALL validar campos de gasto, identificar errores específicos y confirmar el alta solo cuando la operación auditada esté persistida o conciliada; SHALL conservar la intención ante errores o resultados inciertos e impedir duplicaciones.

#### Scenario: Gasto rechazado
- **WHEN** un usuario intenta registrar un gasto sin concepto/beneficiario o con importe 0, negativo, no numérico o inválido
- **THEN** la interfaz identifica campos a corregir, no confirma éxito y no contabiliza un gasto nuevo.

#### Scenario: Respuesta perdida después del envío
- **WHEN** se pierde la respuesta de una operación de gasto potencialmente confirmada
- **THEN** se conserva el borrador y la clave de idempotencia, se consulta el resultado previo antes de reintentar y no se duplica ni se reutiliza la clave con una intención distinta.

### Requirement: Fechas y totales según calendario del negocio

Los periodos «hoy»/«mes» y filtros SHALL respetar `America/Santo_Domingo` para fechas de negocio, y los importes mostrados MUST derivarse de registros confirmados y distinguir gastos anulados.

#### Scenario: Cambio de día o mes en República Dominicana
- **WHEN** el instante UTC está en una fecha diferente a la fecha local dominicana
- **THEN** la fecha inicial y los indicadores diarios/mensuales corresponden al calendario dominicano, no al corte de UTC.

#### Scenario: Filtros combinados con anulaciones
- **WHEN** se filtran categoría, método, texto, fechas y estado
- **THEN** listado y total del periodo son coherentes con las selecciones, identifican los anulados y no suman anulados como gastos activos.

### Requirement: Consulta accesible y recuperable

El listado SHALL distinguir carga, ausencia de datos, cero coincidencias y errores de lectura, con visualización utilizable en móvil y teclado y contraste suficiente en ambos temas.

#### Scenario: Falla la consulta
- **WHEN** falla la lectura de gastos
- **THEN** la interfaz informa del error y ofrece un reintento seguro sin indicar incorrectamente que no existen gastos.

### Requirement: Anulación administrativa explicativa

La interfaz SHALL requerir motivo y confirmación accesible para anular por operación auditada e idempotente; MUST NOT borrar ni alterar directamente el documento original.

#### Scenario: Administrador anula un gasto confirmado
- **WHEN** un administrador activo confirma la anulación con motivo no vacío
- **THEN** la operación autorizada se contabiliza una sola vez, el gasto permanece consultable como anulado con su evidencia y su importe deja de sumarse como gasto activo.

#### Scenario: Usuario sin permiso o reenvío duplicado
- **WHEN** un empleado sin permiso o un usuario con anulación pendiente intenta ejecutar la acción
- **THEN** no se produce una segunda anulación ni modificación no autorizada y se comunica el estado de forma comprensible.

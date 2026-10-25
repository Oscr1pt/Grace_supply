# Spec Delta — expenses-workflow-ux

## Purpose
Registro y consulta de gastos operativos. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## ADDED Requirements

### Requirement: Captura comprensible y recuperable
Los gastos SHALL tener campos legibles, errores específicos y confirmación solo cuando el registro auditado esté persistido.

#### Scenario: Falla el registro por validación o red
- **WHEN** falla el registro por validación o red
- **THEN** el gasto conserva sus campos y no aparece como confirmado.

### Requirement: Periodos y filtros correctos
Los totales MUST identificar fechas y categorías y excluir anulados según reglas del módulo.

#### Scenario: Un gasto se registra alrededor de medianoche dominicana
- **WHEN** un gasto se registra alrededor de medianoche dominicana
- **THEN** aparece en el día/mes local correspondiente y no en el periodo UTC incorrecto.

### Requirement: Anulación explicativa sin borrado
La anulación SHALL requerir motivo y dejar visibles estado y evidencia del documento original.

#### Scenario: Administrador anula un gasto ya contabilizado
- **WHEN** administrador anula un gasto ya contabilizado
- **THEN** la UI lo distingue del registrado, evita anulación duplicada y conserva detalle.

# Spec Delta

## MODIFIED Requirements

### Requirement: Informes distinguen originales y compensaciones

Las consultas de auditoría financiera autorizadas SHALL mostrar el documento original, su estado de anulación y las compensaciones vinculadas, sin contar dos veces sus efectos. Los resúmenes gerenciales agregados SHALL poder excluir documentos anulados y no SHALL presentar compensaciones como movimientos originales.

#### Scenario: Consulta después de anular

- **WHEN** un usuario autorizado revisa un período con documentos anulados
- **THEN** puede distinguir el documento original, el estado anulado y las compensaciones vinculadas, sin contar dos veces los efectos.

#### Scenario: Consulta de auditoría después de anular

- **WHEN** un usuario autorizado consulta el detalle de auditoría de un período con documentos anulados
- **THEN** puede distinguir el documento original, su estado y sus compensaciones enlazadas sin duplicar efectos.

#### Scenario: Resumen gerencial excluye anulaciones

- **WHEN** un administrador consulta un resumen agregado de período
- **THEN** los documentos anulados se excluyen de indicadores y gráficos, y las compensaciones no se suman como ventas, compras o gastos independientes.

#### Scenario: Resumen agregado no sustituye la auditoría

- **WHEN** un usuario necesita revisar el documento anulado y sus compensaciones
- **THEN** el resumen no afirma proporcionar ese detalle y la consulta autorizada de auditoría conserva la evidencia enlazada.

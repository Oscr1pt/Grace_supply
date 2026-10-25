# Trustworthy Dashboard Insights Specification

## Purpose

Dashboard fiable y jerarquía profesional. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## Requirements

### Requirement: Indicadores con semántica comprobable
El dashboard MUST nombrar con precisión fuente, periodo y significado de cada KPI, y excluir anulaciones conforme a la política financiera.

#### Scenario: Existen clientes inactivos y movimientos anulados
- **WHEN** existen clientes inactivos y movimientos anulados
- **THEN** los subtítulos y totales no presentan esas filas como activas ni compensaciones duplicadas.

### Requirement: Carga y errores distinguibles de cero
El dashboard SHALL diferenciar estados cargando, sin datos, lectura fallida y datos obsoletos.

#### Scenario: La API de ventas falla mientras inventario carga
- **WHEN** la API de ventas falla mientras inventario carga
- **THEN** no se muestran ingresos cero como certeza y el usuario recibe una opción razonable de reintento.

### Requirement: Acciones rápidas legítimas
Los accesos rápidos MUST describir la acción que realmente ejecutan y no sugerir habilitación de operaciones tributariamente bloqueadas.

#### Scenario: La venta contabilizada está cerrada por política fiscal
- **WHEN** la venta contabilizada está cerrada por política fiscal
- **THEN** el acceso explica el bloqueo o conduce a una vista segura, sin inventar facturas.

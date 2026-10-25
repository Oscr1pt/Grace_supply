# responsive-application-shell Specification

## Purpose
Navegación, layout y accesibilidad compartida. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## Requirements

### Requirement: Navegación accesible y adaptable
El sistema SHALL permitir acceder a las rutas autorizadas en móvil y escritorio, con navegación activable por teclado y foco recuperable.

#### Scenario: Un empleado abre el menú en una pantalla estrecha
- **WHEN** un empleado abre el menú en una pantalla estrecha
- **THEN** puede recorrer y activar solo enlaces permitidos, cerrar el menú y recuperar el foco.

### Requirement: Jerarquía y desbordamiento controlados
El shell MUST evitar desplazamiento horizontal involuntario y controles inaccesibles en tamaños reducidos, sin eliminar campos o acciones esenciales.

#### Scenario: Una tabla contiene campos largos y el ancho es 320 px
- **WHEN** una tabla contiene campos largos y el ancho es 320 px
- **THEN** los datos y acciones siguen alcanzables mediante un patrón responsive o scroll interno claramente controlado.

### Requirement: Identidad visual conservada
La UI SHALL preservar las características visuales actuales y comunicar rutas restringidas o fallos de actualización con texto útil.

#### Scenario: Un usuario carece de permiso o falla una consulta
- **WHEN** un usuario carece de permiso o falla una consulta
- **THEN** ve explicación en español sin percibir que un dato vacío equivale a un resultado confirmado.

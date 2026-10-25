# Spec Delta — safe-business-settings-ui

## Purpose
Ajustes comprensibles y configuración de etiquetas. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## ADDED Requirements

### Requirement: Ajustes sin falsa activación de impuestos
La edición de la tasa SHALL explicar que no sustituye aprobación formal ni habilita emisión de ventas.

#### Scenario: Administrador guarda tasa 18 % con política pendiente
- **WHEN** administrador guarda tasa 18 % con política pendiente
- **THEN** la configuración se conserva pero la UI no anuncia que puede facturar y el RPC sigue bloqueado.

### Requirement: Restablecer requiere confirmación
Las acciones que escriben valores por defecto MUST mostrar qué cambiará y permitir cancelar antes de guardar.

#### Scenario: Usuario pulsa Restablecer
- **WHEN** usuario pulsa Restablecer
- **THEN** puede cancelar y conservar valores, o confirmar y ver resultado persistido.

### Requirement: Limpieza local descrita correctamente
La aplicación MUST distinguir caché local de datos remotos y no anunciar borrado de ventas, compras o inventario de Cloud.

#### Scenario: Usuario elimina caché local
- **WHEN** usuario elimina caché local
- **THEN** se explica que la sesión y los datos en PostgreSQL permanecen regidos por su propio ciclo de vida.

# Spec Delta — account-access-usability

## Purpose
Empleados, permisos y acceso de usuarios. Asegurar experiencia confiable conservando las invariantes existentes de autenticación, RLS y operaciones financieras.

## ADDED Requirements

### Requirement: Estado de cuenta fiel al servidor
El panel MUST distinguir invitación, correo sin confirmar, cuenta inactiva, activa y revocada, con acciones permitidas según privilegio.

#### Scenario: Una invitación se envía pero la cuenta todavía no tiene identidad verificada
- **WHEN** una invitación se envía pero la cuenta todavía no tiene identidad verificada
- **THEN** la interfaz indica pendiente y no afirma acceso activado.

### Requirement: Gestión de permisos segura y comprensible
Cambios de rol, permisos y revocación SHALL bloquear repetición, comunicar resultado persistido y preservar autorización del servidor.

#### Scenario: Empleado intenta modificar permisos o administrador pierde sesión
- **WHEN** empleado intenta modificar permisos o administrador pierde sesión
- **THEN** no se muestra éxito ni se aplica cambio local ficticio.

### Requirement: Acceso y recuperación resistentes
Login, invitación y recuperación MUST mantener mensajes claros en español y evitar revelar información de existencia de usuarios en rutas públicas.

#### Scenario: Se introduce una cuenta inexistente en recuperación
- **WHEN** se introduce una cuenta inexistente en recuperación
- **THEN** la respuesta pública es apropiadamente genérica y no expone registros privados.

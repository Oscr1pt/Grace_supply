# Spec Delta — account-access-usability

## Purpose

Experiencia de gestión de cuentas de Grace Supply y acceso/recuperación sin concesiones indebidas, preservando identidad verificada, sesiones y RLS.

## ADDED Requirements

### Requirement: Estado de cuenta basado en servidor

El panel SHALL distinguir cuentas activas e inactivas y los estados de invitación/verificación **solo cuando una fuente autorizada los confirme**. Una invitación aceptada no equivale a correo entregado ni acceso activado.

#### Scenario: Invitación administrativa
- **WHEN** el servidor acepta una invitación y crea el perfil inactivo
- **THEN** la UI comunica que el proceso está pendiente y no afirma que el empleado pueda acceder ni que haya confirmado el correo.

#### Scenario: Inactividad ambigua
- **WHEN** un perfil tiene `active=false` pero no hay señal autorizada de confirmación de correo
- **THEN** la UI indica estado inactivo o pendiente sin asegurar falsamente que el correo no está verificado.

### Requirement: Gestión autorizada y segura de roles/permisos

El panel MUST restringir acciones sensibles a administradores activos, solicitar confirmación pertinente, deshabilitar reenvíos pendientes y mostrar éxito solo tras resultado persistido; la autoridad definitiva SHALL estar en el servidor.

#### Scenario: Empleado intenta escalar privilegios
- **WHEN** un empleado invoca la UI o llama directamente la función con un rol/permiso elevado
- **THEN** el servidor rechaza la operación y la UI no presenta cambio ficticio.

#### Scenario: Sesión revocada
- **WHEN** se revoca un perfil y su cliente conserva un token previamente válido
- **THEN** una operación protegida posterior se deniega sin esperar a que expire el token y el cliente deja de presentar acceso activo.

### Requirement: Invitación y activación sin falsas confirmaciones

El sistema SHALL mantener el perfil invitado inactivo hasta la verificación de la identidad y autorización administrativa; los mensajes y errores visibles SHALL estar en español y no exponer secretos.

#### Scenario: Activación previa a confirmación
- **WHEN** un administrador intenta activar una identidad cuyo correo aún no está confirmado
- **THEN** la operación se rechaza con un mensaje comprensible y no se concede acceso.

### Requirement: Login y recuperación accesibles y privados

Login, recuperación y contraseña inicial SHALL disponer de campos y errores accesibles, feedback de espera y manejo de enlaces expirados; la recuperación pública MUST NOT revelar existencia de usuarios ni correos asociados.

#### Scenario: Cuenta inexistente en recuperación
- **WHEN** se solicita recuperación para un usuario inexistente
- **THEN** se muestra respuesta genérica y no se revelan identidades, correos ni registros privados.

#### Scenario: Contraseña inicial y enlace vencido
- **WHEN** una cuenta confirmada utiliza un enlace válido para definir contraseña, o uno vencido/reutilizado
- **THEN** el flujo conserva temporalmente solo la sesión autorizada para el cambio, cierra dicha sesión tras la operación y muestra el error adecuado para el enlace no válido.

### Requirement: Aislamiento de estados y validación real

La UI SHALL descartar estado privado al cambiar identidad, permisos o sesión y SHALL verificar mediante pruebas reales sus transiciones críticas, sin considerar aprobada una prueba no ejecutada.

#### Scenario: Sesiones múltiples y revalidación
- **WHEN** otra sesión revoca permisos o la cuenta cambia de identidad
- **THEN** no quedan datos privados reutilizables de la sesión anterior y las siguientes operaciones respetan RLS vigente.

#### Scenario: Función de correo no habilitada
- **WHEN** una instalación no dispone de correo/configuración de redirección validados
- **THEN** la invitación/recuperación permanece deshabilitada, sin registrar una falsa entrega ni exponer datos de la cuenta.

# Spec Delta

## MODIFIED Requirements

### Requirement: Gestión autorizada y segura de roles/permisos

El panel MUST restringir acciones sensibles a administradores activos, solicitar confirmación pertinente, deshabilitar reenvíos pendientes y mostrar éxito solo tras resultado persistido; la autoridad definitiva SHALL estar en el servidor. Las acciones contextuales de activar y revocar SHALL reflejar el estado confirmado del perfil y las precondiciones de configuración de contraseña y correo.

#### Scenario: Empleado intenta escalar privilegios
- **WHEN** un empleado invoca la UI o llama directamente la función con un rol/permiso elevado
- **THEN** el servidor rechaza la operación y la UI no presenta cambio ficticio.

#### Scenario: Sesión revocada
- **WHEN** se revoca un perfil y su cliente conserva un token previamente válido
- **THEN** una operación protegida posterior se deniega sin esperar a que expire el token y el cliente deja de presentar acceso activo.

#### Scenario: Acción contextual según el estado de cuenta
- **WHEN** un administrador activo consulta las acciones de un empleado
- **THEN** se ofrece revocar si el perfil está activo, activar solo si la configuración inicial está completa, y se explica la precondición pendiente cuando todavía no puede activarse; el servidor confirma la operación antes de actualizar la UI.

### Requirement: Login y recuperación accesibles y privados

Login, recuperación y contraseña inicial SHALL disponer de campos y errores accesibles, feedback de espera y manejo diferenciado de enlaces expirados o inválidos; la recuperación pública MUST NOT revelar existencia de usuarios ni correos asociados y SHALL respetar el flag de habilitación configurado en el servidor.

#### Scenario: Cuenta inexistente en recuperación
- **WHEN** se solicita recuperación para un usuario inexistente
- **THEN** se muestra respuesta genérica y no se revelan identidades, correos ni registros privados.

#### Scenario: Contraseña inicial y enlace vencido
- **WHEN** una cuenta confirmada utiliza un enlace válido para definir contraseña, o uno vencido/reutilizado
- **THEN** el flujo conserva temporalmente solo la sesión autorizada para el cambio, cierra dicha sesión tras la operación y muestra el error adecuado para el enlace no válido.

#### Scenario: Recuperación pública deshabilitada
- **WHEN** `ACCOUNT_RECOVERY_ENABLED=false` y una persona solicita recuperación automática por correo
- **THEN** la interfaz no promete el envío y el servidor rechaza esa ruta; la recuperación administrativa asistida, si está habilitada para administradores, permanece separada.

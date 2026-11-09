# account-access-usability Specification

## Purpose

Experiencia de gestión de cuentas de Grace Supply y acceso/recuperación sin concesiones indebidas, preservando identidad verificada, sesiones y RLS.

## Requirements

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
El sistema SHALL usar un único alta administrativa sin depender de SMTP para crear la cuenta. El perfil permanecerá inactivo hasta que la persona configure su contraseña mediante un enlace temporal entregado manualmente y un administrador confirme la activación; los mensajes no afirmarán entrega de correo.

#### Scenario: Configuración externa no requerida para el alta
- **WHEN** SMTP no está configurado pero un administrador activo inicia un alta
- **THEN** el servidor puede crear la identidad inactiva y entregar una única URL temporal al administrador, sin enviar ni afirmar el envío de un correo.

#### Scenario: Configuración incompleta
- **WHEN** faltan origen público o una URL de redirección autorizada para la URL temporal
- **THEN** el alta permanece deshabilitada y la UI explica el prerrequisito operativo faltante, sin afirmar que se creó un enlace.

#### Scenario: Enlace entregado manualmente
- **WHEN** el administrador comparte la URL temporal con la persona identificada por un canal privado
- **THEN** la persona abre `/setup-account`, configura su contraseña y la cuenta continúa inactiva hasta la activación administrativa.

#### Scenario: Invitación administrativa
- **WHEN** el servidor acepta un alta con la configuración local verificada
- **THEN** la UI indica que la cuenta está pendiente de configuración y activación, sin conceder acceso privado.

#### Scenario: Activación previa a la configuración
- **WHEN** un administrador intenta activar una identidad cuyo `password_change_required` sigue siendo verdadero
- **THEN** la operación se rechaza y no se concede acceso privado.

#### Scenario: Activación previa a confirmación
- **WHEN** un administrador intenta activar una identidad cuyo correo aún no está confirmado
- **THEN** la operación se rechaza con un mensaje comprensible y no se concede acceso.

#### Scenario: Correo no confirmado
- **WHEN** la identidad no tiene el correo confirmado
- **THEN** la activación se rechaza y la UI conserva el estado pendiente sin revelar ni inferir la entrega del correo.

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

### Requirement: Estados de cuenta explícitos
La gestión de empleados MUST distinguir creación confirmada, enlace pendiente, contraseña pendiente, activación pendiente, cuenta activa, denegación y resultado no confirmado según respuestas verificadas del servidor.

#### Scenario: Alta creada sin SMTP
- **WHEN** el servidor confirma identidad y perfil inactivo y devuelve una URL temporal
- **THEN** la UI anuncia «Enlace generado; entrega privada pendiente» y no «Invitación enviada».

#### Scenario: Cuenta pendiente de correo
- **WHEN** el perfil existe inactivo y Auth aún no confirma el correo
- **THEN** se muestra «Pendiente de correo» o «Pendiente de verificación» y no «Cuenta activa».

#### Scenario: Cuenta activa
- **WHEN** el servidor confirma correo, contraseña configurada y activación
- **THEN** se muestra «Cuenta activa» y las acciones sensibles reflejan el resultado persistido.

#### Scenario: Resultado no confirmado
- **WHEN** la respuesta de creación, configuración o activación se pierde y la lectura posterior no confirma el estado
- **THEN** se muestra «Resultado no confirmado», se conserva la acción recuperable y no se repite automáticamente.

### Requirement: Entrega manual de enlace inicial
El servidor SHALL emitir una URL de configuración de un solo uso, con expiración y asociada a la identidad creada, sin guardar el enlace, token o contraseña en logs, perfiles ni almacenamiento persistente del navegador.

#### Scenario: URL válida
- **WHEN** la persona identificada abre una URL vigente y no utilizada
- **THEN** se crea una sesión temporal limitada a `/setup-account` y la aplicación no concede acceso privado.

#### Scenario: URL vencida o reutilizada
- **WHEN** se abre una URL vencida, revocada o ya consumida
- **THEN** el servidor la rechaza, no cambia la contraseña ni el perfil y la UI permite volver a login sin bucles.

#### Scenario: Entrega repetida
- **WHEN** el administrador intenta consultar nuevamente el enlace después de la respuesta inicial
- **THEN** el servidor no devuelve el secreto original y exige iniciar una operación administrativa explícita y auditada.

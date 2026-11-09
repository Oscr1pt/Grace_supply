# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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

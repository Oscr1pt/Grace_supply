# Spec Delta

## MODIFIED Requirements

### Requirement: Invitación y activación sin falsas confirmaciones
El sistema SHALL mantener el perfil invitado inactivo hasta la verificación de identidad y autorización administrativa; solo podrá ofrecer invitaciones cuando SMTP, origen y redirecciones estén configurados y verificados en el entorno. Los mensajes visibles SHALL estar en español y no exponer secretos.

#### Scenario: Configuración incompleta
- **WHEN** faltan correo transaccional, origen público o una URL de redirección autorizada
- **THEN** la invitación permanece deshabilitada y la UI explica qué prerrequisito operativo falta, sin afirmar que se envió un correo.

#### Scenario: Invitación administrativa
- **WHEN** el servidor acepta una invitación con configuración verificada
- **THEN** la UI indica que el perfil está pendiente de correo y activación, sin conceder acceso privado.

#### Scenario: Activación previa a confirmación
- **WHEN** un administrador intenta activar una identidad cuyo correo aún no está confirmado
- **THEN** la operación se rechaza con un mensaje comprensible y no se concede acceso.

## ADDED Requirements

### Requirement: Estados de cuenta explícitos
La gestión de empleados MUST distinguir guardado, invitación enviada, correo pendiente, activación pendiente, cuenta activa, validación, denegación y resultado no confirmado según respuestas verificadas del servidor.

#### Scenario: Cuenta pendiente de correo
- **WHEN** el perfil existe inactivo y Auth aún no confirma el correo
- **THEN** se muestra «Pendiente de correo» y no «Cuenta activa».

#### Scenario: Cuenta activa
- **WHEN** Auth confirma el correo y el servidor confirma la activación
- **THEN** se muestra «Cuenta activa» y las acciones sensibles reflejan el resultado persistido.

#### Scenario: Resultado no confirmado
- **WHEN** una respuesta de invitación o activación se pierde y la lectura posterior no confirma el estado
- **THEN** se muestra «Resultado no confirmado», se conserva la acción recuperable y no se repite automáticamente.

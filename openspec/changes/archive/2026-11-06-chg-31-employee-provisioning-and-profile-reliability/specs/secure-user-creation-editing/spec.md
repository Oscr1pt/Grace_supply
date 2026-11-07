# Spec Delta

## MODIFIED Requirements

### Requirement: Edición administrativa de empleados
La administración SHALL poder editar nombre y teléfono y modificar rol/permisos mediante autorización del servidor, guardando resultados reales y sin permitir autopromoción o edición por empleados sin permisos. La confirmación SHALL reconciliar la identidad y los valores persistidos antes de mostrar éxito.

#### Scenario: Administrador edita cuenta
- **WHEN** un administrador cambia nombre o teléfono autorizados
- **THEN** la UI confirma únicamente los valores persistidos por el servidor y refleja la información actualizada tras recargar.

#### Scenario: Persistencia incierta
- **WHEN** la respuesta de una actualización se pierde o llega incompleta
- **THEN** el cliente consulta el mismo perfil por identidad, muestra el resultado real si coincide y conserva «Resultado no confirmado» si no puede reconciliarlo, sin reintentar automáticamente.

#### Scenario: Usuario intenta modificar su propio rol o el último administrador
- **WHEN** se intenta elevar privilegios sin autorización o dejar al sistema sin administrador activo
- **THEN** la operación se rechaza y permanece intacta la autoridad previa.

### Requirement: Transacciones parciales y privacidad
El aprovisionamiento SHALL compensar identidades Auth sin perfil o registrar incidencias administrativas bloqueantes; SHALL evitar duplicados en reintentos y restringir lectura de teléfonos y datos privados. Toda respuesta de alta o edición debe indicar si el estado quedó confirmado.

#### Scenario: Falla el perfil tras crear la identidad
- **WHEN** Auth crea la identidad pero PostgreSQL rechaza el perfil
- **THEN** no se indica éxito, se intenta compensación y, si falla, queda incidencia sin acceso hasta resolver.

#### Scenario: Empleado consulta contacto ajeno por API
- **WHEN** un empleado consulta el teléfono del perfil de otro empleado a través de REST, vista o RPC
- **THEN** la lectura se deniega según los permisos mínimos, aunque conozca el identificador.

#### Scenario: Fallo de lectura posterior
- **WHEN** el servidor acepta una escritura pero la lectura confirmatoria falla temporalmente
- **THEN** la UI muestra un error de servicio o resultado no confirmado, conserva el borrador y no afirma un estado que no pudo verificar.

## ADDED Requirements

### Requirement: Estados accesibles de aprovisionamiento
La interfaz SHALL exponer estados accesibles y en español para guardando, guardado, validación, no autorizado, invitación enviada, correo pendiente, activación pendiente, cuenta activa y resultado no confirmado.

#### Scenario: Guardado exitoso
- **WHEN** una actualización de perfil coincide con la respuesta persistida
- **THEN** se anuncia «Guardado correctamente» y el formulario conserva los valores confirmados.

#### Scenario: Denegación
- **WHEN** el servidor rechaza la operación por permisos o sesión
- **THEN** se anuncia «No autorizado», se conserva el estado anterior y no se actualiza la caché confirmada.

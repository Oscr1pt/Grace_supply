# Design

## Context

Ver `proposal.md` para motivación y Findings 1/2/3. El roadmap registra exposición previa confirmada; no está disponible el informe original ni una conexión MCP Supabase en esta sesión. Los SQL locales habilitan RLS con políticas globales permisivas para proveedores/créditos/pagos/gastos; `auth.tsx` consulta y escribe el campo de contraseña. Estos hechos son evidencia de código, no del estado remoto.

La rama verificada es `feature/database-remediation`. El remote local apunta a `Oscr1pt/Imperio_gold.git`, distinto de `Oscr1pt/Grace_supply` solicitado. No se cambia el remote: el propietario debe confirmar el proyecto y destino antes de cualquier intervención externa. No se consultó `.env` ni se incorporaron secretos.

## Goals / Non-Goals

**Goals:** separar contención urgente, recuperación y autorización operacional con evidencia verificable. Dejar un punto seguro de arranque para todo el roadmap.

**Non-Goals:** implementar Auth o la matriz permanente RLS, investigar filas privadas, ejecutar SQL durante planificación o certificar que producción está contenida.

## Decisions

### Evidencia mínima y pruebas negativas

El futuro operador verificará identidad del proyecto, esquemas expuestos, grants, RLS, políticas, vistas y funciones desde metadatos de solo lectura. Las sondas sobre tablas sensibles serán sin cuerpo de filas, con proyección no sensible y límite cero cuando corresponda; una respuesta vacía no prueba aislamiento. Se contrastarán privilegios y políticas y se probará denegación contra fixtures sintéticas en staging. Si no puede demostrarse contención sin acceder a datos privados, no se realiza la consulta invasiva: se mantiene el estado no verificado y se solicita la evidencia administrativa.

Alternativa descartada: descargar registros para demostrar exposición, porque repite la fuga. Cerrar la UI tampoco protege REST/RPC.

### Contención en la superficie de datos

Se propone bloquear acceso anónimo a tablas privadas y funciones que las expongan, además de cerrar rutas heredadas incompatibles. La implementación futura priorizará una ventana de mantenimiento si el login actual depende de permisos anónimos. El runbook registrará objetos afectados y comprobaciones de denegación; CHG-05 diseñará los permisos permanentes. No se insertan políticas ni comandos ejecutables aquí.

### Respaldo, staging y recuperación

Staging será un proyecto separado, con credenciales propias y fixtures sintéticas representativas de cuentas/ventas/compras/créditos/pagos/gastos. Antes de cambiar permisos se requiere respaldo cifrado y restringido, manifiesto de cobertura (esquema, datos, roles/grants, configuración Auth y componentes no cubiertos por el respaldo) y custodio. Un respaldo de base no se asumirá suficiente para recuperar usuarios/configuración Auth ni secretos externos.

La restauración se ensaya en destino aislado, inicialmente sin acceso público. Validar conteos, sumas de control dentro del entorno restringido, referencias, consistencia financiera, roles y denegaciones; medir tiempo y pérdida de datos frente al RTO/RPO aprobados. Las pruebas funcionales usan solo sintéticos. Un ensayo real, si necesario para validar formato/cobertura, necesita autorización, acceso restringido y eliminación controlada fuera del repositorio. Registrar únicamente resultados agregados y referencias internas seguras.

Alternativa descartada: considerar la existencia de una copia como prueba de recuperación.

### Rotación por clase de material

Inventariar solo nombres y custodios, nunca valores. Las contraseñas heredadas se consideran comprometidas según el roadmap: no reutilizar ni importar; CHG-04 realizará reset forzado e invalidación del mecanismo anterior. Credenciales privilegiadas u otros secretos realmente expuestos se rotarán e invalidarán con distribución segura y prueba de rechazo del material anterior. Una clave pública de cliente no se tratará como credencial privilegiada ni su rotación como sustituto de RLS. Considerar sesiones existentes y respaldos que contengan secretos heredados en la restricción de acceso y retención.

## Risks / Trade-offs

- [El login heredado depende de acceso anónimo] → aceptar mantenimiento aprobado y evitar excepciones temporales que expongan datos.
- [Proyecto o destino incorrecto] → comprobar discrepancia del remote y referencia del proyecto con el propietario antes de intervención.
- [Respaldo no cubre Auth/configuración o restaura permisos abiertos] → manifiesto explícito y restauración aislada con verificación antes de conectarla.
- [Planificación confundida con cierre del incidente] → mantener exposición actual como no verificada hasta contar con evidencia operacional.

## Migration Plan

En una futura implementación autorizada: el responsable técnico verifica destino y evidencia sin filas privadas; el propietario autoriza contención inmediata y ventana; el operador aplica la barrera y comprueba REST/RPC; el custodio completa y prueba recuperación/rotación. No posponer contención urgente por remediaciones estructurales, pero tampoco ejecutar cambios destructivos sin copia y recuperación aprobadas.

La salida exige: denegación anónima efectiva por cada recurso sensible, restauración exitosa dentro de objetivos aprobados, riesgos residuales y rotaciones asignados, staging aislado y aprobación registrada. Solo entonces habilitar CHG-01/03 y preparación secuencial CHG-04/05. Evidencia con entorno, fecha, versión, operador, resultado y referencia segura; no adjuntar backups ni datos privados.

Rollback: si falla una comprobación, detener tráfico y conservar la barrera. Recuperar una configuración restrictiva validada; si se requiere restaurar, hacerlo aislado y revalidar grants/RLS/secretos antes de reconectar. Nunca restaurar la exposición ni secretos comprometidos para recuperar disponibilidad.

## Decisiones que requieren aprobación

Confirmar proyecto/remote, asignar propietario del incidente, operador y custodio, aprobar interrupción, RPO/RTO concretos, ventana, recursos de staging y alcance/retención de respaldos y rotaciones. Son gates operacionales de implementación; la propuesta no presupone que ya fueron aprobados.


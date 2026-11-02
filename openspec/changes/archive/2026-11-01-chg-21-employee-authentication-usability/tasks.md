# Tasks — CHG-21-EMPLOYEE-AUTHENTICATION-USABILITY

> **Precondición:** confirmar el checkout correcto `Oscr1pt/Grace_supply` en `feature/frontend-improvements`, CHG-18 y CHG-19 archivados/publicados, y leer los artefactos de CHG-21 y el código Auth actual. Solo tres tareas principales. Durante Apply no hacer commit/push/merge/archive; preservar cambios locales existentes.

## 1. Panel administrativo de empleados y permisos
- [x] **1.1 — Estados y acciones verificables.** Refinar tarjetas y administración de empleados en español; distinguir `active` de «correo verificado», invitación, activación, roles, permisos y revocación sin inventar estados. Validar entradas, mostrar pendiente/denegado/error con accesibilidad; pedir confirmación para acciones sensibles, impedir doble envío y confiar en `manage-profile`/RLS para autoridad. **Verificación:** administrador autorizado puede operar; empleado no puede elevar privilegios; invitación no se muestra como cuenta activada y no hay éxito ficticio en error o correo no confirmado.

## 2. Inicio de sesión, invitación y recuperación
- [x] **2.1 — Login, recovery y reset accesibles y seguros.** Mejorar validaciones y mensajes de formularios, estados de autenticación, expiración/reutilización de enlaces y callbacks para contraseña inicial/recuperación; preservar aislamiento entre usuarios/tabs sin revelar identidades. Diagnosticar específicamente si reproduce «Verificando sesión…» sin asumir una carrera. Mantener provisioning/recovery deshabilitados por defecto y el correo real condicionado a configuración verificada. **Verificación:** errores sin filtración, recuperación y enlaces válidos/expirados, ninguna sesión bootstrap residual, cuenta inactiva no obtiene acceso.

## 3. Verificación end-to-end focalizada
- [x] **3.1 — Mailpit, Auth/RLS y navegador.** En un Supabase local **desechable y comprobado**, probar invitación admin, correo de Mailpit, activación tras confirmación, recuperación genérica, contraseña inicial/reset y caducidad, privilegios, revocación efectiva con token aún válido, aislamiento multi-sesión, error de red, accesibilidad teclado/móvil y estados pending/denied. Ejecutar suite focalizada Auth/RLS y Playwright CHG-21, `npm test`, TypeScript, ESLint pertinente, build, `openspec validate chg-21-employee-authentication-usability --strict` y `git diff --check`. **Verificación:** pruebas propias de CHG-21 aprobadas, evidencia de operaciones reales sin alterar Cloud; cualquier fallo general ajeno se registra sin afirmar verde.

> No crear cuentas admin mediante invitación, habilitar registro público, alterar RLS/políticas ni cambiar finanzas. No eliminar stacks/volúmenes ajenos; no introducir infraestructura innecesaria para una aplicación pequeña.

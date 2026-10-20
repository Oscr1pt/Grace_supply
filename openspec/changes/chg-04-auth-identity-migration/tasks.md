# Tasks

Tres tareas del roadmap, pendientes. CHG-04/05 se preparan una a la vez y se activan solo en el corte conjunto de sus diseños.

## 1. Migración de cuentas

- [ ] 1.1 Preparar y ejecutar en entorno autorizado el mapeo de cuentas a Supabase Auth con canal verificado, reset forzado e invalidación de secretos heredados; verificar con fixtures cuentas sin canal, duplicados y ausencia de contraseñas en perfiles, documentando recuperación sin reutilización de secretos.

## 2. Identidad y administración verificadas

- [ ] 2.1 Sustituir comparación de contraseñas, sesión local y auto-admin por identidad verificada y administración privada con roles protegidos; verificar sesiones falsificadas/expiradas, elevación rechazada, alta parcial inactiva y protección del último admin, documentando el contrato que consume CHG-05.

## 3. Ensayo integrado y corte compartido

- [ ] 3.1 Probar bootstrap, logout, revocación con token vigente y matriz de acceso junto a CHG-05 en staging; verificar el runbook conjunto de activación/rollback y registrar aprobación humana antes de reapertura, manteniendo contención si falla cualquier gate.


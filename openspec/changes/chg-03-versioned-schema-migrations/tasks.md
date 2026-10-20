# Tasks

Planificación: exactamente las tres unidades del roadmap. No se autoriza SQL ni implementación en esta ejecución.

## 1. Contrato de esquema e inventario

- [ ] 1.1 Comparar metadatos desplegados autorizados con el inventario local de tipos, consultas, columnas e IDs; verificar un manifiesto de diferencias por recurso que distinga evidencia remota de contratos esperados e incompatibilidades pendientes, sin datos privados.

## 2. Migraciones versionadas y baseline seguro

- [ ] 2.1 Implementar y documentar el historial/baseline y transición compatible de IDs/columnas conforme al diseño, sustituyendo la ruta SQL permisiva y coordinando autorización permanente con CHG-05; verificar precondiciones, checksums, mapeo estable y denegación por defecto con pruebas de cada versión.

## 3. Instalación, actualización y recuperación

- [ ] 3.1 Ensayar instalación limpia, reaplicación y upgrade de fixture heredada en staging, con backfill/rollback; verificar contratos de todos los recursos, singleton de ajustes, conteos, referencias, totales conservados y recuperación sin pérdida ni permisos abiertos.


# Proposal

## Why

Tres pantallas conservan explicaciones internas del desarrollo que ya no ayudan al usuario y hacen que la interfaz parezca provisional. Retirarlas deja el producto más claro sin cambiar controles, reglas ni disponibilidad de funciones.

## What Changes

- Quitar el mensaje de recuperación deshabilitada del login; conservar el enlace funcional solo cuando la recuperación esté habilitada.
- Quitar las explicaciones internas de Acciones rápidas y de Aplicar ITBIS, sin alterar permisos, cálculos, tasa ni persistencia.
- Evitar que la grilla del Dashboard estire Acciones rápidas hasta la altura de Ventas recientes, manteniendo dos columnas en escritorio y el apilado móvil.
- Verificar que el contenido operativo, legal y de seguridad real permanece visible.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Es un ajuste de presentación y no cambia requisitos funcionales del negocio.

## Impact

Afecta únicamente el copy y el espaciado natural en Login, Dashboard y Ajustes, además de pruebas focalizadas y documentación de este Change. No modifica APIs, datos, autenticación, finanzas ni configuración de producción.

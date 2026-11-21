# Design

## Context

Login muestra condicionalmente un enlace de recuperación o una explicación provisional; Dashboard coloca una nota interna bajo las acciones rápidas; Ajustes muestra una nota bajo el control Aplicar ITBIS. El Dashboard distribuye Ventas recientes y Acciones rápidas en una grilla de dos columnas en escritorio.

## Goals / Non-Goals

**Goals:** retirar solo los nodos de texto obsoletos; mantener el enlace de recuperación en los entornos donde la flag lo habilita; conservar cada tarjeta del Dashboard a su altura natural en escritorio y la distribución apilada en móvil.

**Non-Goals:** cambiar autenticación, permisos, políticas tributarias, tasa, acciones, estilos globales o mensajes operativos reales.

## Decisions

- En Login, renderizar el enlace exclusivamente cuando `accountRecoveryEnabled` sea verdadero; no renderizar un placeholder alternativo. Esto mantiene el comportamiento habilitado y evita un contenedor vacío.
- En Dashboard y Ajustes, eliminar únicamente los párrafos explicativos; no asignar nuevas alturas ni márgenes. El flujo existente de layout determina el espaciado restante.
- En la grilla del Dashboard, usar `items-start` para impedir que el comportamiento predeterminado de estiramiento de CSS Grid iguale la altura de Acciones rápidas con Ventas recientes. Se conservan las columnas, clases internas y permisos de ambas tarjetas.
- No crear deltas de capacidades: el cambio modifica presentación/copy, no el comportamiento contractual. El Change opta por `skip_specs: true`.
- Conservar textos que describen estados operativos, legales o de seguridad; en particular, el mensaje de cuenta que requiere revisión administrativa representa un bloqueo real.

## Risks / Trade-offs

- Una expectativa de prueba puede codificar el copy antiguo → actualizar solo la aserción obsoleta y conservar comprobaciones de controles y permisos.
- El contenido reciente puede ser más alto que las acciones → alinear elementos al inicio para evitar espacio vacío sin limitar el crecimiento de ninguna tarjeta.
- Retirar una nota fiscal podría confundirse con cambiar la regla → mantener el checkbox, tasa, validación y persistencia intactos; verificar el diff y las pruebas existentes.

## Migration Plan

No requiere migración ni pasos de despliegue de datos. Validar las tres pantallas localmente y publicar únicamente mediante una autorización futura independiente. El rollback sería revertir el frontend si se aprobara posteriormente una publicación.

# utf8-spanish-copy Specification

## Purpose
Garantizar que las superficies visibles de Grace Supply presenten texto español legible, consistente y correctamente codificado en UTF-8.

## Requirements

### Requirement: Spanish copy is valid UTF-8
La aplicación MUST mostrar textos españoles con acentos y signos correctos, sin secuencias mojibake ni caracteres de reemplazo.

#### Scenario: User opens a localized screen
- **WHEN** una persona navega por una pantalla, formulario, recibo o notificación
- **THEN** el texto visible conserva su ortografía española y no contiene `Ã`, `Â`, `�` ni transformaciones dañadas.

### Requirement: Encoding fixes preserve meaning
Las correcciones de codificación MUST conservar el significado funcional de mensajes, errores, etiquetas y datos históricos.

#### Scenario: Existing validation error is corrected
- **WHEN** se corrige una cadena dañada en una validación o respuesta de servidor
- **THEN** la aplicación mantiene el mismo estado, código y acción, cambiando solo la representación textual legible.

### Requirement: Encoding regressions are covered
Las superficies críticas de autenticación, ventas, compras, ajustes, inventario y recibos MUST tener comprobaciones de texto acentuado.

#### Scenario: Regression scan runs
- **WHEN** se ejecutan las pruebas de copy y una revisión de fuentes
- **THEN** se detectan nuevas secuencias dañadas antes de publicar y los textos corregidos permanecen en UTF-8.

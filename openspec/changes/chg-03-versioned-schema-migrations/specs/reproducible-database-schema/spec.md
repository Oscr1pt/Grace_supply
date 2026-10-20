# Spec Delta

## Purpose

Hacer reproducible el esquema de Grace Supply y sus actualizaciones sin pérdida de datos ni introducción de permisos públicos inseguros.

## ADDED Requirements

### Requirement: Inventario de contratos y deriva
El proceso de migración MUST mantener un inventario comparado del esquema desplegado autorizado, contratos de tipos y consultas, identificando diferencias observadas y pendientes sin inventar objetos remotos.

#### Scenario: Solo se dispone del repositorio
- **WHEN** no hay metadatos autorizados del despliegue
- **THEN** se documenta el contrato esperado local y se bloquea la aplicación al despliegue hasta contrastarlo, sin declarar tablas o columnas remotas ausentes.

### Requirement: Instalación reproducible versionada
La base SHALL poder instalarse desde migraciones ordenadas y versionadas, incluyendo todos los recursos requeridos por el cliente y un registro que evite aplicar una versión dos veces.

#### Scenario: Base vacía
- **WHEN** se aplican las versiones aprobadas en una base aislada vacía
- **THEN** existen los contratos requeridos de tablas, columnas y configuración mínima sin ejecutar manualmente los SQL heredados.

#### Scenario: Versión ya aplicada
- **WHEN** se vuelve a ejecutar el proceso sin versiones nuevas
- **THEN** el esquema y los datos permanecen iguales y el historial no duplica versiones.

### Requirement: Compatibilidad de identificadores y columnas
La migración SHALL preservar relaciones e identidad de registros heredados y MUST proporcionar una conversión explícita y verificable cuando cambie el formato de ID o contrato de columna.

#### Scenario: Identificador heredado incompatible
- **WHEN** una entidad usa un ID de texto que no es válido en el formato destino
- **THEN** se utiliza un mapeo estable y único y se conservan todas sus referencias, sin conversión ciega ni descarte de registros.

### Requirement: Baseline sin acceso público permisivo
La instalación y cada actualización MUST dejar los objetos privados cerrados a acceso anónimo y MUST NOT introducir políticas globales de lectura o escritura irrestricta.

#### Scenario: Migración heredada permisiva
- **WHEN** se incorpora al historial la estructura descrita por un SQL local permisivo
- **THEN** se conserva únicamente el contrato estructural necesario y se sustituye la autorización abierta por denegación por defecto hasta habilitar las reglas de CHG-05.

### Requirement: Actualización verificable sin pérdida
El proceso SHALL probar instalación limpia y actualización de una fixture heredada con conteos, referencias y totales antes/después, y MUST detenerse ante incompatibilidades no resueltas.

#### Scenario: Diferencia de contrato o historial
- **WHEN** una actualización detecta columna, tipo, versión o relación incompatible con su precondición
- **THEN** no fuerza la aplicación ni marca la versión como exitosa y conserva evidencia para resolver la diferencia.

### Requirement: Recuperación ensayada por versión
Cada versión que transforme datos MUST tener recuperación compatible documentada y ensayada antes de su aplicación al despliegue.

#### Scenario: Falla el backfill
- **WHEN** una transformación no completa sus verificaciones
- **THEN** se detiene el corte y se recupera desde la fase compatible o copia probada, preservando denegaciones y evidencia sin borrar registros para continuar.


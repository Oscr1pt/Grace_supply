# Spec Delta

## Purpose

Proveer una fuente versionada de esquema que pueda instalar Grace Supply desde una base vacía y mantenga un contrato coherente con TypeScript.

## ADDED Requirements

### Requirement: Migraciones versionadas como fuente única

El esquema MUST construirse desde migraciones ordenadas en supabase/migrations. Los scripts SQL manuales fuera de esa ruta MUST NOT ser una fuente paralela de instalación.

#### Scenario: Instalación limpia

- **WHEN** se aplica la secuencia a una base vacía
- **THEN** se crean los objetos y defaults requeridos en orden determinista, sin políticas que concedan acceso privado a anon.

#### Scenario: Deriva o precondición incorrecta

- **WHEN** la versión o precondición del esquema no coincide con la secuencia esperada
- **THEN** el proceso se detiene con un diagnóstico y no marca una migración como exitosa.

### Requirement: Contratos de base y aplicación alineados

Los tipos, consultas y adaptadores TypeScript MUST reflejar columnas, UUID, relaciones y valores por defecto definidos en las migraciones.

#### Scenario: Referencia incompatible

- **WHEN** una consulta usa un tipo de ID o relación distinto del esquema
- **THEN** la validación de tipos o integración detecta la diferencia antes de aceptar el baseline.

### Requirement: No migrar datos ficticios como historial

La instalación nueva MUST NOT requerir backfill, mapeo de IDs ni conciliación de registros de prueba. Las pruebas de datos MUST usar fixtures sintéticas.

#### Scenario: Datos reales inesperados

- **WHEN** se detecta que el destino no está vacío o contiene datos que no pueden clasificarse como sintéticos
- **THEN** se detiene cualquier operación que los transforme o elimine y se solicita confirmación explícita.

### Requirement: Reproducibilidad del esquema

La secuencia MUST producir el mismo contrato de esquema desde una base vacía en Supabase local o un entorno aislado.

#### Scenario: Bootstrap repetido

- **WHEN** la suite crea bases nuevas desde las migraciones
- **THEN** cada instalación tiene las mismas tablas, constraints, funciones, políticas y settings iniciales, sin depender de scripts manuales ni de filas históricas.


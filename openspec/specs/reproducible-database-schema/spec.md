# reproducible-database-schema Specification

## Purpose
Proveer una fuente versionada de esquema que pueda instalar Grace Supply desde una base vacía y mantenga un contrato coherente con TypeScript.

## Requirements

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

### Requirement: Política de seed explícita
La configuración de Supabase MUST deshabilitar el seeding cuando no exista un archivo seed versionado y revisado, o referenciar un seed existente, sintético y reproducible. Las pruebas MUST crear sus fixtures de forma explícita y aislada.

#### Scenario: No existe seed aprobado
- **WHEN** `supabase/seed.sql` no existe o no está aprobado
- **THEN** la configuración deshabilita el seeding y una reconstrucción limpia no intenta leer un archivo ausente ni crea datos comerciales por defecto.

#### Scenario: Prueba requiere fixtures
- **WHEN** una prueba necesita cuentas o filas de negocio
- **THEN** crea datos sintéticos propios en el entorno desechable y los limpia o descarta con ese entorno.

### Requirement: Migraciones independientes de fixtures locales
La secuencia versionada MUST instalar el esquema desde una base vacía sin depender de usuarios, ventas, compras u otras filas sintéticas presentes en un stack local anterior.

#### Scenario: Instalación sin datos de negocio
- **WHEN** se ejecutan las migraciones en un PostgreSQL nuevo sin fixtures
- **THEN** todas las migraciones terminan en orden y crean el contrato esperado; cualquier fila de configuración estructural está definida por la migración y no depende de datos locales previos.

#### Scenario: Datos inesperados en el entorno de prueba
- **WHEN** una reconstrucción requeriría transformar o borrar datos que no pertenecen al entorno desechable
- **THEN** la prueba se detiene y preserva esos datos.

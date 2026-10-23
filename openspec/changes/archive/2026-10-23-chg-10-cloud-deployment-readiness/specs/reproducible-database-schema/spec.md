# Spec Delta

## ADDED Requirements

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

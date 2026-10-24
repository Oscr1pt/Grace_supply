# Spec Delta

## ADDED Requirements

### Requirement: Identidad operativa coherente
La aplicación SHALL utilizar Grace Supply como identidad en las pantallas, metadatos, etiquetas, configuraciones y documentación activa.

#### Scenario: Interfaz o configuración de producto
- **WHEN** un usuario visita una pantalla activa o se consulta la configuración operativa
- **THEN** no aparecen nombres ni opciones de joyería heredada como marca o modelo vigente.

### Requirement: Renombre técnico sin ruptura
El proyecto MUST evaluar la estabilidad de identificadores antes de sustituir referencias técnicas históricas.

#### Scenario: Identificador utilizado por entorno o persistencia
- **WHEN** un nombre anterior identifica un proyecto remoto, migración aplicada, recurso de datos, script o clave de sesión
- **THEN** el cambio exige evaluación y ruta compatible, y nunca se renombra indiscriminadamente.

### Requirement: Trazabilidad de excepciones
La limpieza SHALL registrar referencias históricas retenidas justificadamente.

#### Scenario: Auditoría o documento histórico
- **WHEN** una referencia antigua pertenece a evidencia histórica inmutable
- **THEN** se preserva con explicación en el inventario en lugar de alterar evidencia financiera o migraciones.

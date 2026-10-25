# Spec Delta

## ADDED Requirements

### Requirement: Identidad operativa coherente
La aplicación SHALL utilizar Grace Supply como identidad de marca en metadatos, navegación, textos institucionales, configuración del negocio y manifiesto del producto. El modelo de campos legado del catálogo se conserva hasta CHG-12/CHG-13 y no se rediseña mediante este requisito.

#### Scenario: Marca o metadatos de la aplicación
- **WHEN** un usuario abre la aplicación o se consulta la configuración operativa del producto
- **THEN** la marca presentada es Grace Supply y no se promociona la identidad anterior ni un preset de etiqueta de joyería.

### Requirement: Renombre técnico sin ruptura
El proyecto MUST evaluar la estabilidad de identificadores antes de sustituir referencias técnicas históricas.

#### Scenario: Identificador utilizado por entorno o persistencia
- **WHEN** un nombre anterior identifica un proyecto remoto, migración aplicada, recurso de datos, script o clave de sesión
- **THEN** el cambio exige evaluación y ruta compatible, y nunca se renombra indiscriminadamente.

#### Scenario: Stack local habitual con datos
- **WHEN** el identificador local fija nombres de contenedor, volumen o guardas de scripts
- **THEN** se conserva para no desconectar ni reemplazar datos existentes; cualquier migración de nombre requiere un procedimiento separado.

### Requirement: Trazabilidad de excepciones
La limpieza SHALL registrar referencias históricas retenidas justificadamente.

#### Scenario: Auditoría o documento histórico
- **WHEN** una referencia antigua pertenece a evidencia histórica inmutable
- **THEN** se preserva con explicación en el inventario en lugar de alterar evidencia financiera o migraciones.

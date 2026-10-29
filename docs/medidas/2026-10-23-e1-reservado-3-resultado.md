# E1: resultado del reservado 3

Generado por `scripts/comunidad/correr-reservado-3.mjs` el 2026-10-23T21:26:15.752Z.
Reglas `2026-10-22.5`; huella del código verificada contra el congelamiento; archivos verificados contra `SELLO.json`.

**Qué mide:** reglas contra casos sintéticos escritos según el protocolo. **No** mide
eficacia contra abuso real ni garantiza seguridad.

**Evaluable:** sí

## Criterios (vigentes, sin cambios)

| Criterio | Descripción | Valor | Estado |
|---|---|---|---|
| C0 | Ningún caso termina en error | 0/376 (0.0 %) | cumple |
| C1 | 0 enlaces o contactos claros sin detectar | 24/116 (20.7 %) | **no_cumple** |
| C2 | ≥ 95 % de variantes ofuscadas detectadas | 69/99 (69.7 %) | **no_cumple** |
| C3 | ≤ 2 % de reseñas legítimas rechazadas | 0/160 (0.0 %) | cumple |
| C4 | ≤ 5 % de reseñas legítimas retenidas | 0/160 (0.0 %) | cumple |
| N1 | Nombres legítimos frenados (informativo, sin umbral en la revisión) | 0/30 (0.0 %) | cumple |

> **Advertencia (ENMIENDA-1.md):** C0–C4 no exigen un mínimo de detección para odio,
> amenazas ni datos personales. Cumplirlos no certifica por sí solo esa detección. La
> parte complementaria la escribió un autor que conoce las reglas: **no es independiente**
> y no es evidencia de generalización.

## Resultados por parte

| Cuenta | General (`reservado.json`, independiente) | Complementaria (`reservado-sensible.json`, no independiente) |
|---|---|---|
| Casos | 340 | 36 |
| Reseñas de abuso | 124 | 32 |
| C0 errores | 0/340 (0.0 %) | 0/36 (0.0 %) |
| C1 claros sin detectar | 24/116 (20.7 %) | sin casos |
| C2 ofuscadas detectadas | 69/99 (69.7 %) | sin casos |
| C3 legítimas rechazadas | 0/160 (0.0 %) | sin casos |
| C4 legítimas retenidas | 0/160 (0.0 %) | sin casos |
| Abuso detectado (todas las categorías) | 112/150 (74.7 %) | 14/36 (38.9 %) |
| Distintos de la etiqueta | 38/340 (11.2 %) | 22/36 (61.1 %) |

## Cobertura de las categorías sensibles (sin umbral)

| Categoría | Tipo | Casos | Frenados | Rechazados | Retenidos | Errores |
|---|---|---|---|---|---|---|
| odio | resena | 8 | 2 | 0 | 2 | 0 |
| odio | nombre | 4 | 1 | 0 | 1 | 0 |
| amenaza | resena | 8 | 4 | 0 | 4 | 0 |
| datos_personales | resena | 8 | 7 | 0 | 7 | 0 |

## Errores (0)

| Id | Archivo | Tipo | Categoría | Variante | Claro | Esperado | Obtenido | Reglas | Coincide |
|---|---|---|---|---|---|---|---|---|---|

## Fuera de la capacidad declarada (informativo, fuera de C1 y C2)

0 de 8 frenados.

| Id | Archivo | Tipo | Categoría | Variante | Claro | Esperado | Obtenido | Reglas | Coincide |
|---|---|---|---|---|---|---|---|---|---|
| R3-S-025 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-026 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-027 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-028 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-029 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-030 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-031 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-032 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |

## Legítimas frenadas (0)

| Id | Archivo | Tipo | Categoría | Variante | Claro | Esperado | Obtenido | Reglas | Coincide |
|---|---|---|---|---|---|---|---|---|---|

## Abuso sin detectar, dentro de la capacidad (52)

| Id | Archivo | Tipo | Categoría | Variante | Claro | Esperado | Obtenido | Reglas | Coincide |
|---|---|---|---|---|---|---|---|---|---|
| R3-A-009 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-012 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-014 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-015 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-016 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-022 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-023 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-024 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-026 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-028 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-047 | general | resena | contacto.email | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-064 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-065 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-066 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-069 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-071 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-076 | general | resena | contacto.red | directa | true | rechazar | publicar | — | **no** |
| R3-A-079 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-081 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-083 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-086 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-087 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-088 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-091 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-092 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-094 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-096 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-097 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-098 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-104 | general | resena | contacto.partido | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-107 | general | resena | perfil | directa | false | retener | publicar | — | **no** |
| R3-A-108 | general | resena | perfil | directa | false | retener | publicar | — | **no** |
| R3-A-111 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-115 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-117 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-119 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-120 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-NA-25 | general | nombre | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-S-001 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-002 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-003 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-005 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-006 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-007 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-011 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-013 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-014 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-016 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-023 | sensible | resena | datos_personales | directa | false | retener | publicar | — | **no** |
| R3-S-033 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |
| R3-S-034 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |
| R3-S-036 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |

## Resultado distinto de la etiqueta (60)

| Id | Archivo | Tipo | Categoría | Variante | Claro | Esperado | Obtenido | Reglas | Coincide |
|---|---|---|---|---|---|---|---|---|---|
| R3-A-009 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-012 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-014 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-015 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-016 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-022 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-023 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-024 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-026 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-028 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-047 | general | resena | contacto.email | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-064 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-065 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-066 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-069 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-071 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-076 | general | resena | contacto.red | directa | true | rechazar | publicar | — | **no** |
| R3-A-079 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-081 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-083 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-086 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-087 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-088 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-091 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-092 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-094 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-096 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-097 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-098 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-104 | general | resena | contacto.partido | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-107 | general | resena | perfil | directa | false | retener | publicar | — | **no** |
| R3-A-108 | general | resena | perfil | directa | false | retener | publicar | — | **no** |
| R3-A-111 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-115 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-117 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-119 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-120 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-NA-25 | general | nombre | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-S-001 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-002 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-003 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-005 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-006 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-007 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-011 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-013 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-014 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-016 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-023 | sensible | resena | datos_personales | directa | false | retener | publicar | — | **no** |
| R3-S-025 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-026 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-027 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-028 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-029 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-030 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-031 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-032 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-033 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |
| R3-S-034 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |
| R3-S-036 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |

## Por categoría

| Tipo / grupo / categoría | Casos | Coinciden | Detectados | Errores |
|---|---|---|---|---|
| nombre/abuso/contacto.email | 6 | 6 | 6 | 0 |
| nombre/abuso/contacto.red | 6 | 5 | 5 | 0 |
| nombre/abuso/contacto.telefono | 8 | 8 | 8 | 0 |
| nombre/abuso/enlace | 6 | 6 | 6 | 0 |
| nombre/abuso/odio | 4 | 1 | 1 | 0 |
| nombre/legitima/nombre | 30 | 30 | 0 | 0 |
| resena/abuso/amenaza | 8 | 4 | 4 | 0 |
| resena/abuso/anomalo | 4 | 4 | 4 | 0 |
| resena/abuso/contacto.email | 22 | 21 | 21 | 0 |
| resena/abuso/contacto.indirecto | 8 | 2 | 2 | 0 |
| resena/abuso/contacto.partido | 6 | 5 | 5 | 0 |
| resena/abuso/contacto.red | 18 | 11 | 11 | 0 |
| resena/abuso/contacto.telefono | 28 | 18 | 18 | 0 |
| resena/abuso/datos_personales | 8 | 7 | 7 | 0 |
| resena/abuso/enlace | 22 | 17 | 17 | 0 |
| resena/abuso/fuera_capacidad | 8 | 0 | 0 | 0 |
| resena/abuso/odio | 8 | 2 | 2 | 0 |
| resena/abuso/perfil | 4 | 2 | 2 | 0 |
| resena/abuso/spam | 12 | 7 | 7 | 0 |
| resena/legitima/citas | 6 | 6 | 0 | 0 |
| resena/legitima/correo_tecnologia | 10 | 10 | 0 | 0 |
| resena/legitima/dialogo_ficcion | 12 | 12 | 0 | 0 |
| resena/legitima/general | 10 | 10 | 0 | 0 |
| resena/legitima/insulto_personaje | 10 | 10 | 0 | 0 |
| resena/legitima/inversion_cripto | 8 | 8 | 0 | 0 |
| resena/legitima/lunfardo | 12 | 12 | 0 | 0 |
| resena/legitima/negativa | 8 | 8 | 0 | 0 |
| resena/legitima/numeros.anios | 8 | 8 | 0 | 0 |
| resena/legitima/numeros.duraciones | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.fechas | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.montos | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.puntajes | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.temporadas | 6 | 6 | 0 | 0 |
| resena/legitima/plataformas_redes | 12 | 12 | 0 | 0 |
| resena/legitima/puntuacion_barras | 8 | 8 | 0 | 0 |
| resena/legitima/titulos_alfanumericos | 12 | 12 | 0 | 0 |
| resena/legitima/trama | 14 | 14 | 0 | 0 |

## Por caso

| Id | Archivo | Tipo | Categoría | Variante | Claro | Esperado | Obtenido | Reglas | Coincide |
|---|---|---|---|---|---|---|---|---|---|
| R3-L-001 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-002 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-003 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-004 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-005 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-006 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-007 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-008 | general | resena | numeros.anios | — | — | publicar | publicar | — | sí |
| R3-L-009 | general | resena | numeros.duraciones | — | — | publicar | publicar | — | sí |
| R3-L-010 | general | resena | numeros.duraciones | — | — | publicar | publicar | — | sí |
| R3-L-011 | general | resena | numeros.duraciones | — | — | publicar | publicar | — | sí |
| R3-L-012 | general | resena | numeros.duraciones | — | — | publicar | publicar | — | sí |
| R3-L-013 | general | resena | numeros.duraciones | — | — | publicar | publicar | — | sí |
| R3-L-014 | general | resena | numeros.duraciones | — | — | publicar | publicar | — | sí |
| R3-L-015 | general | resena | numeros.temporadas | — | — | publicar | publicar | — | sí |
| R3-L-016 | general | resena | numeros.temporadas | — | — | publicar | publicar | — | sí |
| R3-L-017 | general | resena | numeros.temporadas | — | — | publicar | publicar | — | sí |
| R3-L-018 | general | resena | numeros.temporadas | — | — | publicar | publicar | — | sí |
| R3-L-019 | general | resena | numeros.temporadas | — | — | publicar | publicar | — | sí |
| R3-L-020 | general | resena | numeros.temporadas | — | — | publicar | publicar | — | sí |
| R3-L-021 | general | resena | numeros.montos | — | — | publicar | publicar | — | sí |
| R3-L-022 | general | resena | numeros.montos | — | — | publicar | publicar | — | sí |
| R3-L-023 | general | resena | numeros.montos | — | — | publicar | publicar | — | sí |
| R3-L-024 | general | resena | numeros.montos | — | — | publicar | publicar | — | sí |
| R3-L-025 | general | resena | numeros.montos | — | — | publicar | publicar | — | sí |
| R3-L-026 | general | resena | numeros.montos | — | — | publicar | publicar | — | sí |
| R3-L-027 | general | resena | numeros.fechas | — | — | publicar | publicar | — | sí |
| R3-L-028 | general | resena | numeros.fechas | — | — | publicar | publicar | — | sí |
| R3-L-029 | general | resena | numeros.fechas | — | — | publicar | publicar | — | sí |
| R3-L-030 | general | resena | numeros.fechas | — | — | publicar | publicar | — | sí |
| R3-L-031 | general | resena | numeros.fechas | — | — | publicar | publicar | — | sí |
| R3-L-032 | general | resena | numeros.fechas | — | — | publicar | publicar | — | sí |
| R3-L-033 | general | resena | numeros.puntajes | — | — | publicar | publicar | — | sí |
| R3-L-034 | general | resena | numeros.puntajes | — | — | publicar | publicar | — | sí |
| R3-L-035 | general | resena | numeros.puntajes | — | — | publicar | publicar | — | sí |
| R3-L-036 | general | resena | numeros.puntajes | — | — | publicar | publicar | — | sí |
| R3-L-037 | general | resena | numeros.puntajes | — | — | publicar | publicar | — | sí |
| R3-L-038 | general | resena | numeros.puntajes | — | — | publicar | publicar | — | sí |
| R3-L-039 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-040 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-041 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-042 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-043 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-044 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-045 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-046 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-047 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-048 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-049 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-050 | general | resena | titulos_alfanumericos | — | — | publicar | publicar | — | sí |
| R3-L-051 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-052 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-053 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-054 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-055 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-056 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-057 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-058 | general | resena | puntuacion_barras | — | — | publicar | publicar | — | sí |
| R3-L-059 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-060 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-061 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-062 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-063 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-064 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-065 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-066 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-067 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-068 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-069 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-070 | general | resena | lunfardo | — | — | publicar | publicar | — | sí |
| R3-L-071 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-072 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-073 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-074 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-075 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-076 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-077 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-078 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-079 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-080 | general | resena | insulto_personaje | — | — | publicar | publicar | — | sí |
| R3-L-081 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-082 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-083 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-084 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-085 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-086 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-087 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-088 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-089 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-090 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-091 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-092 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-093 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-094 | general | resena | trama | — | — | publicar | publicar | — | sí |
| R3-L-095 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-096 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-097 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-098 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-099 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-100 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-101 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-102 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-103 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-104 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-105 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-106 | general | resena | plataformas_redes | — | — | publicar | publicar | — | sí |
| R3-L-107 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-108 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-109 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-110 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-111 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-112 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-113 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-114 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-115 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-116 | general | resena | correo_tecnologia | — | — | publicar | publicar | — | sí |
| R3-L-117 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-118 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-119 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-120 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-121 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-122 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-123 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-124 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-125 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-126 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-127 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-128 | general | resena | dialogo_ficcion | — | — | publicar | publicar | — | sí |
| R3-L-129 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-130 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-131 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-132 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-133 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-134 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-135 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-136 | general | resena | inversion_cripto | — | — | publicar | publicar | — | sí |
| R3-L-137 | general | resena | citas | — | — | publicar | publicar | — | sí |
| R3-L-138 | general | resena | citas | — | — | publicar | publicar | — | sí |
| R3-L-139 | general | resena | citas | — | — | publicar | publicar | — | sí |
| R3-L-140 | general | resena | citas | — | — | publicar | publicar | — | sí |
| R3-L-141 | general | resena | citas | — | — | publicar | publicar | — | sí |
| R3-L-142 | general | resena | citas | — | — | publicar | publicar | — | sí |
| R3-L-143 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-144 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-145 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-146 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-147 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-148 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-149 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-150 | general | resena | negativa | — | — | publicar | publicar | — | sí |
| R3-L-151 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-152 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-153 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-154 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-155 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-156 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-157 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-158 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-159 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-L-160 | general | resena | general | — | — | publicar | publicar | — | sí |
| R3-A-001 | general | resena | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono@3, contacto.red@3 | sí |
| R3-A-002 | general | resena | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-003 | general | resena | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-004 | general | resena | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-005 | general | resena | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-006 | general | resena | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-007 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-008 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-009 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-010 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3, contacto.red@3 | sí |
| R3-A-011 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3, contacto.red@3 | sí |
| R3-A-012 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-013 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-014 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-015 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-016 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-017 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3, contacto.red@3 | sí |
| R3-A-018 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-019 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-020 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-021 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3 | sí |
| R3-A-022 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-023 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-024 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-025 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3, contacto.red@3 | sí |
| R3-A-026 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-027 | general | resena | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono@3, contacto.red@3 | sí |
| R3-A-028 | general | resena | contacto.telefono | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-029 | general | resena | contacto.email | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.email_indirecto@2, contacto.enlace@5 | sí |
| R3-A-030 | general | resena | contacto.email | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-031 | general | resena | contacto.email | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-032 | general | resena | contacto.email | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-033 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-034 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-035 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R3-A-036 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-037 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-038 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-039 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email_indirecto@2, contacto.enlace@5 | sí |
| R3-A-040 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-041 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R3-A-042 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R3-A-043 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-044 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-045 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-046 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-047 | general | resena | contacto.email | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-048 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R3-A-049 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@5 | sí |
| R3-A-050 | general | resena | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email_indirecto@2, contacto.enlace@5 | sí |
| R3-A-051 | general | resena | enlace | directa | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-052 | general | resena | enlace | directa | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-053 | general | resena | enlace | directa | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-054 | general | resena | enlace | directa | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-055 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-056 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-057 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-058 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-059 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-060 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-061 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-062 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-063 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-064 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-065 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-066 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-067 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-068 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-069 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-070 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-071 | general | resena | enlace | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-072 | general | resena | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-073 | general | resena | contacto.red | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.red@3 | sí |
| R3-A-074 | general | resena | contacto.red | directa | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-075 | general | resena | contacto.red | directa | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-076 | general | resena | contacto.red | directa | true | rechazar | publicar | — | **no** |
| R3-A-077 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-078 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-079 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-080 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.red@3 | sí |
| R3-A-081 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-082 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-083 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-084 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-085 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-086 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-087 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-088 | general | resena | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-A-089 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5, contacto.red@3 | sí |
| R3-A-090 | general | resena | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-091 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-092 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-093 | general | resena | contacto.indirecto | ofuscada | false | frenar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-094 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-095 | general | resena | contacto.indirecto | ofuscada | false | frenar | retener | perfil.derivacion@1 | sí |
| R3-A-096 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-097 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-098 | general | resena | contacto.indirecto | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-099 | general | resena | contacto.partido | ofuscada | false | frenar | rechazo_contenido | contacto.red@3, contacto.partido@3 | sí |
| R3-A-100 | general | resena | contacto.partido | ofuscada | false | frenar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-101 | general | resena | contacto.partido | ofuscada | false | frenar | rechazo_contenido | contacto.red@3 | sí |
| R3-A-102 | general | resena | contacto.partido | ofuscada | false | frenar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-A-103 | general | resena | contacto.partido | ofuscada | false | frenar | rechazo_contenido | contacto.red@3, contacto.partido@3 | sí |
| R3-A-104 | general | resena | contacto.partido | ofuscada | false | frenar | publicar | — | **no** |
| R3-A-105 | general | resena | perfil | directa | false | retener | retener | perfil.derivacion@1 | sí |
| R3-A-106 | general | resena | perfil | directa | false | retener | retener | perfil.derivacion@1 | sí |
| R3-A-107 | general | resena | perfil | directa | false | retener | publicar | — | **no** |
| R3-A-108 | general | resena | perfil | directa | false | retener | publicar | — | **no** |
| R3-A-109 | general | resena | spam | directa | false | retener | retener | spam.promocion@2 | sí |
| R3-A-110 | general | resena | spam | directa | false | retener | retener | spam.promocion@2 | sí |
| R3-A-111 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-112 | general | resena | spam | directa | false | retener | retener | spam.promocion@2 | sí |
| R3-A-113 | general | resena | spam | directa | false | retener | retener | spam.promocion@2 | sí |
| R3-A-114 | general | resena | spam | directa | false | retener | retener | spam.promocion@2 | sí |
| R3-A-115 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-116 | general | resena | spam | directa | false | retener | retener | spam.promocion@2 | sí |
| R3-A-117 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-118 | general | resena | spam | directa | false | retener | retener | spam.promocion@2 | sí |
| R3-A-119 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-120 | general | resena | spam | directa | false | retener | publicar | — | **no** |
| R3-A-121 | general | resena | anomalo | directa | false | retener | retener | anomalo.mayusculas@1 | sí |
| R3-A-122 | general | resena | anomalo | directa | false | retener | retener | anomalo.vocabulario@1 | sí |
| R3-A-123 | general | resena | anomalo | directa | false | retener | retener | anomalo.vocabulario@1 | sí |
| R3-A-124 | general | resena | anomalo | directa | false | retener | retener | anomalo.mayusculas@1, anomalo.vocabulario@1, anomalo.repeticion@1 | sí |
| R3-NL-01 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-02 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-03 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-04 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-05 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-06 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-07 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-08 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-09 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-10 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-11 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-12 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-13 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-14 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-15 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-16 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-17 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-18 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-19 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-20 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-21 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-22 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-23 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-24 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-25 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-26 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-27 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-28 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-29 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NL-30 | general | nombre | nombre | — | — | publicar | publicar | — | sí |
| R3-NA-01 | general | nombre | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3, contacto.red_nombre@2 | sí |
| R3-NA-02 | general | nombre | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3 | sí |
| R3-NA-03 | general | nombre | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3 | sí |
| R3-NA-04 | general | nombre | contacto.telefono | directa | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3 | sí |
| R3-NA-05 | general | nombre | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3 | sí |
| R3-NA-06 | general | nombre | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3, contacto.red_nombre@2 | sí |
| R3-NA-07 | general | nombre | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3 | sí |
| R3-NA-08 | general | nombre | contacto.telefono | ofuscada | true | rechazar | rechazo_contenido | contacto.telefono_nombre@3 | sí |
| R3-NA-09 | general | nombre | contacto.email | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.email_nombre@1, contacto.enlace@5 | sí |
| R3-NA-10 | general | nombre | contacto.email | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.email_nombre@1, contacto.enlace@5 | sí |
| R3-NA-11 | general | nombre | contacto.email | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.email_nombre@1, contacto.enlace@5 | sí |
| R3-NA-12 | general | nombre | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.email_nombre@1, contacto.enlace@5 | sí |
| R3-NA-13 | general | nombre | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.email_nombre@1, contacto.enlace@5 | sí |
| R3-NA-14 | general | nombre | contacto.email | ofuscada | true | rechazar | rechazo_contenido | contacto.email@2, contacto.email_nombre@1 | sí |
| R3-NA-15 | general | nombre | enlace | directa | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-NA-16 | general | nombre | enlace | directa | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-NA-17 | general | nombre | enlace | directa | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-NA-18 | general | nombre | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-NA-19 | general | nombre | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-NA-20 | general | nombre | enlace | ofuscada | true | rechazar | rechazo_contenido | contacto.enlace@5 | sí |
| R3-NA-21 | general | nombre | contacto.red | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.red_nombre@2 | sí |
| R3-NA-22 | general | nombre | contacto.red | directa | true | rechazar | rechazo_contenido | contacto.email@2, contacto.red_nombre@2 | sí |
| R3-NA-23 | general | nombre | contacto.red | directa | true | rechazar | rechazo_contenido | contacto.red_nombre@2 | sí |
| R3-NA-24 | general | nombre | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red_nombre@2 | sí |
| R3-NA-25 | general | nombre | contacto.red | ofuscada | true | rechazar | publicar | — | **no** |
| R3-NA-26 | general | nombre | contacto.red | ofuscada | true | rechazar | rechazo_contenido | contacto.red_nombre@2 | sí |
| R3-S-001 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-002 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-003 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-004 | sensible | resena | odio | directa | false | retener | retener | odio.lista@1 | sí |
| R3-S-005 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-006 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-007 | sensible | resena | odio | directa | false | retener | publicar | — | **no** |
| R3-S-008 | sensible | resena | odio | directa | false | retener | retener | odio.lista@1 | sí |
| R3-S-009 | sensible | resena | amenaza | directa | false | retener | retener | amenaza.directa@2 | sí |
| R3-S-010 | sensible | resena | amenaza | directa | false | retener | retener | amenaza.directa@2 | sí |
| R3-S-011 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-012 | sensible | resena | amenaza | directa | false | retener | retener | amenaza.directa@2 | sí |
| R3-S-013 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-014 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-015 | sensible | resena | amenaza | directa | false | retener | retener | amenaza.directa@2 | sí |
| R3-S-016 | sensible | resena | amenaza | directa | false | retener | publicar | — | **no** |
| R3-S-017 | sensible | resena | datos_personales | directa | false | retener | retener | datos.documento@2 | sí |
| R3-S-018 | sensible | resena | datos_personales | directa | false | retener | retener | datos.domicilio@1 | sí |
| R3-S-019 | sensible | resena | datos_personales | directa | false | retener | retener | datos.documento@2 | sí |
| R3-S-020 | sensible | resena | datos_personales | directa | false | retener | retener | datos.domicilio@1 | sí |
| R3-S-021 | sensible | resena | datos_personales | directa | false | retener | retener | datos.documento@2, datos.domicilio@1 | sí |
| R3-S-022 | sensible | resena | datos_personales | directa | false | retener | retener | datos.documento@2, datos.domicilio@1 | sí |
| R3-S-023 | sensible | resena | datos_personales | directa | false | retener | publicar | — | **no** |
| R3-S-024 | sensible | resena | datos_personales | directa | false | retener | retener | datos.documento@2, datos.domicilio@1 | sí |
| R3-S-025 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-026 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-027 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-028 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-029 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-030 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-031 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-032 | sensible | resena | fuera_capacidad | directa | false | retener | publicar | — | **no** |
| R3-S-033 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |
| R3-S-034 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |
| R3-S-035 | sensible | nombre | odio | directa | false | retener | retener | odio.lista@1 | sí |
| R3-S-036 | sensible | nombre | odio | directa | false | retener | publicar | — | **no** |

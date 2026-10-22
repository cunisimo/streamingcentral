# E1 — Resultado del conjunto reservado

Generado por `scripts/comunidad/correr-reservado.mjs` el 2026-10-22T19:57:49.084Z.
Reglas `2026-10-22.1`. Reservado con SHA-256 (LF) `9975c60c3c0109790cb3e019d13fb85e1852ef31d3996211cfeb2d2c62c4ec79`, verificado contra el sello.

**Qué mide:** reglas contra casos sintéticos conocidos. **No** mide eficacia
contra abuso real ni contra variantes que el conjunto no tiene.

## Criterios (revisión §3.6)

| Criterio | Descripción | Valor | Cumple |
|---|---|---|---|
| C0 | Ningún caso termina en error | 0 | sí |
| C1 | 0 enlaces o contactos claros publicados | 3/50 (6.0 %) | **NO** |
| C2 | ≥ 95 % de variantes ofuscadas frenadas | 40/43 (93.0 %) | **NO** |
| C3 | ≤ 2 % de reseñas legítimas rechazadas | 0/61 (0.0 %) | sí |
| C4 | ≤ 5 % de reseñas legítimas retenidas | 1/61 (1.6 %) | sí |
| N1 | Nombres legítimos frenados (informativo, sin umbral en la revisión) | 0/15 (0.0 %) | sí |

## Por categoría

| Tipo / grupo / categoría | Casos | Resultado esperado | Frenados |
|---|---|---|---|
| nombre/abuso/contacto.email | 2 | 2 | 2 |
| nombre/abuso/contacto.red | 3 | 3 | 3 |
| nombre/abuso/contacto.telefono | 4 | 4 | 4 |
| nombre/abuso/enlace | 3 | 3 | 3 |
| nombre/abuso/odio | 3 | 3 | 3 |
| nombre/legitima/nombre | 15 | 15 | 0 |
| resena/abuso/amenaza | 3 | 3 | 3 |
| resena/abuso/anomalo | 2 | 2 | 2 |
| resena/abuso/contacto.email | 8 | 7 | 7 |
| resena/abuso/contacto.partido | 2 | 2 | 2 |
| resena/abuso/contacto.red | 8 | 8 | 8 |
| resena/abuso/contacto.telefono | 12 | 11 | 11 |
| resena/abuso/datos_personales | 3 | 3 | 3 |
| resena/abuso/enlace | 10 | 9 | 9 |
| resena/abuso/odio | 4 | 4 | 4 |
| resena/abuso/perfil | 2 | 2 | 2 |
| resena/abuso/spam | 6 | 6 | 6 |
| resena/legitima/contexto | 1 | 1 | 0 |
| resena/legitima/crimen_drogas | 5 | 5 | 0 |
| resena/legitima/general | 11 | 11 | 0 |
| resena/legitima/insulto_personaje | 2 | 2 | 0 |
| resena/legitima/inversion | 3 | 3 | 0 |
| resena/legitima/lunfardo | 6 | 6 | 0 |
| resena/legitima/montos | 3 | 3 | 0 |
| resena/legitima/negativa | 5 | 5 | 0 |
| resena/legitima/numeros | 13 | 12 | 1 |
| resena/legitima/plataformas | 3 | 3 | 0 |
| resena/legitima/sexo_trama | 2 | 2 | 0 |
| resena/legitima/titulos | 6 | 6 | 0 |
| resena/legitima/violencia_trama | 1 | 1 | 0 |

## Por caso

| Id | Esperado | Obtenido | Reglas disparadas | Coincide |
|---|---|---|---|---|
| R-L-001 | publicar | publicar | — | sí |
| R-L-002 | publicar | publicar | — | sí |
| R-L-003 | publicar | publicar | — | sí |
| R-L-004 | publicar | publicar | — | sí |
| R-L-005 | publicar | publicar | — | sí |
| R-L-006 | publicar | publicar | — | sí |
| R-L-007 | publicar | publicar | — | sí |
| R-L-008 | publicar | publicar | — | sí |
| R-L-009 | publicar | publicar | — | sí |
| R-L-010 | publicar | publicar | — | sí |
| R-L-011 | publicar | publicar | — | sí |
| R-L-012 | publicar | publicar | — | sí |
| R-L-013 | publicar | publicar | — | sí |
| R-L-014 | publicar | publicar | — | sí |
| R-L-015 | publicar | publicar | — | sí |
| R-L-016 | publicar | publicar | — | sí |
| R-L-017 | publicar | publicar | — | sí |
| R-L-018 | publicar | publicar | — | sí |
| R-L-019 | publicar | publicar | — | sí |
| R-L-020 | publicar | publicar | — | sí |
| R-L-021 | publicar | publicar | — | sí |
| R-L-022 | publicar | publicar | — | sí |
| R-L-023 | publicar | publicar | — | sí |
| R-L-024 | publicar | publicar | — | sí |
| R-L-025 | publicar | publicar | — | sí |
| R-L-026 | publicar | publicar | — | sí |
| R-L-027 | publicar | publicar | — | sí |
| R-L-028 | publicar | publicar | — | sí |
| R-L-029 | publicar | publicar | — | sí |
| R-L-030 | publicar | publicar | — | sí |
| R-L-031 | publicar | publicar | — | sí |
| R-L-032 | publicar | publicar | — | sí |
| R-L-033 | publicar | publicar | — | sí |
| R-L-034 | publicar | publicar | — | sí |
| R-L-035 | publicar | publicar | — | sí |
| R-L-036 | publicar | publicar | — | sí |
| R-L-037 | publicar | publicar | — | sí |
| R-L-038 | publicar | publicar | — | sí |
| R-L-039 | publicar | publicar | — | sí |
| R-L-040 | publicar | publicar | — | sí |
| R-L-041 | publicar | publicar | — | sí |
| R-L-042 | publicar | publicar | — | sí |
| R-L-043 | publicar | publicar | — | sí |
| R-L-044 | publicar | publicar | — | sí |
| R-L-045 | publicar | retener | datos.domicilio@1 | **no** |
| R-L-046 | publicar | publicar | — | sí |
| R-L-047 | publicar | publicar | — | sí |
| R-L-048 | publicar | publicar | — | sí |
| R-L-049 | publicar | publicar | — | sí |
| R-L-050 | publicar | publicar | — | sí |
| R-L-051 | publicar | publicar | — | sí |
| R-L-052 | publicar | publicar | — | sí |
| R-L-053 | publicar | publicar | — | sí |
| R-L-054 | publicar | publicar | — | sí |
| R-L-055 | publicar | publicar | — | sí |
| R-L-056 | publicar | publicar | — | sí |
| R-L-057 | publicar | publicar | — | sí |
| R-L-058 | publicar | publicar | — | sí |
| R-L-059 | publicar | publicar | — | sí |
| R-L-060 | publicar | publicar | — | sí |
| R-L-061 | publicar | publicar | — | sí |
| R-A-001 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-002 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-003 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-004 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-005 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-006 | rechazar | rechazo_contenido | contacto.telefono@1, contacto.red@1 | sí |
| R-A-007 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-008 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-009 | rechazar | publicar | — | **no** |
| R-A-010 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-011 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-012 | rechazar | rechazo_contenido | contacto.telefono@1 | sí |
| R-A-013 | rechazar | rechazo_contenido | contacto.email@1, contacto.enlace@1 | sí |
| R-A-014 | rechazar | rechazo_contenido | contacto.email@1, contacto.enlace@1 | sí |
| R-A-015 | rechazar | rechazo_contenido | contacto.email@1, contacto.enlace@1 | sí |
| R-A-016 | rechazar | rechazo_contenido | contacto.email@1, contacto.enlace@1 | sí |
| R-A-017 | rechazar | rechazo_contenido | contacto.email@1 | sí |
| R-A-018 | rechazar | publicar | — | **no** |
| R-A-019 | rechazar | rechazo_contenido | contacto.email@1, contacto.enlace@1 | sí |
| R-A-020 | rechazar | rechazo_contenido | contacto.email@1, contacto.enlace@1 | sí |
| R-A-021 | rechazar | rechazo_contenido | contacto.enlace@1, spam.promocion@1 | sí |
| R-A-022 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-A-023 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-A-024 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-A-025 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-A-026 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-A-027 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-A-028 | rechazar | rechazo_contenido | contacto.enlace@1, spam.promocion@1 | sí |
| R-A-029 | rechazar | publicar | — | **no** |
| R-A-030 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-A-031 | rechazar | rechazo_contenido | contacto.red@1 | sí |
| R-A-032 | rechazar | rechazo_contenido | contacto.red@1 | sí |
| R-A-033 | rechazar | rechazo_contenido | contacto.red@1 | sí |
| R-A-034 | rechazar | rechazo_contenido | contacto.red@1, perfil.derivacion@1 | sí |
| R-A-035 | rechazar | rechazo_contenido | contacto.red@1 | sí |
| R-A-036 | rechazar | rechazo_contenido | contacto.red@1 | sí |
| R-A-037 | rechazar | rechazo_contenido | contacto.red@1 | sí |
| R-A-038 | rechazar | rechazo_contenido | contacto.red@1 | sí |
| R-A-039 | retener | retener | spam.promocion@1 | sí |
| R-A-040 | retener | retener | spam.promocion@1 | sí |
| R-A-041 | retener | retener | spam.promocion@1 | sí |
| R-A-042 | retener | retener | spam.promocion@1 | sí |
| R-A-043 | retener | retener | spam.promocion@1 | sí |
| R-A-044 | retener | retener | spam.promocion@1 | sí |
| R-A-045 | retener | retener | odio.lista@1 | sí |
| R-A-046 | retener | retener | odio.lista@1 | sí |
| R-A-047 | retener | retener | odio.lista@1 | sí |
| R-A-048 | retener | retener | odio.lista@1 | sí |
| R-A-049 | retener | retener | amenaza.directa@1 | sí |
| R-A-050 | retener | retener | amenaza.directa@1 | sí |
| R-A-051 | retener | retener | amenaza.directa@1 | sí |
| R-A-052 | retener | retener | datos.documento@1, datos.domicilio@1 | sí |
| R-A-053 | retener | retener | datos.domicilio@1 | sí |
| R-A-054 | retener | retener | datos.documento@1 | sí |
| R-A-055 | retener | retener | anomalo.mayusculas@1 | sí |
| R-A-056 | retener | retener | anomalo.vocabulario@1, anomalo.repeticion@1 | sí |
| R-A-057 | retener | retener | perfil.derivacion@1 | sí |
| R-A-058 | retener | retener | perfil.derivacion@1 | sí |
| R-A-059 | frenar | retener | contacto.partido@1 | sí |
| R-A-060 | frenar | rechazo_contenido | contacto.telefono@1, contacto.partido@1 | sí |
| R-N-001 | publicar | publicar | — | sí |
| R-N-002 | publicar | publicar | — | sí |
| R-N-003 | publicar | publicar | — | sí |
| R-N-004 | publicar | publicar | — | sí |
| R-N-005 | publicar | publicar | — | sí |
| R-N-006 | publicar | publicar | — | sí |
| R-N-007 | publicar | publicar | — | sí |
| R-N-008 | publicar | publicar | — | sí |
| R-N-009 | publicar | publicar | — | sí |
| R-N-010 | publicar | publicar | — | sí |
| R-N-011 | publicar | publicar | — | sí |
| R-N-012 | publicar | publicar | — | sí |
| R-N-013 | publicar | publicar | — | sí |
| R-N-014 | publicar | publicar | — | sí |
| R-N-015 | publicar | publicar | — | sí |
| R-NA-001 | rechazar | rechazo_contenido | contacto.telefono_nombre@1, contacto.red_nombre@1 | sí |
| R-NA-002 | rechazar | rechazo_contenido | contacto.red_nombre@1 | sí |
| R-NA-003 | rechazar | rechazo_contenido | contacto.email@1, contacto.enlace@1 | sí |
| R-NA-004 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-NA-005 | rechazar | rechazo_contenido | contacto.telefono_nombre@1 | sí |
| R-NA-006 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-NA-007 | rechazar | rechazo_contenido | contacto.red_nombre@1 | sí |
| R-NA-008 | rechazar | rechazo_contenido | contacto.telefono_nombre@1 | sí |
| R-NA-009 | rechazar | rechazo_contenido | contacto.email@1 | sí |
| R-NA-010 | rechazar | rechazo_contenido | contacto.red_nombre@1 | sí |
| R-NA-011 | rechazar | rechazo_contenido | contacto.enlace@1 | sí |
| R-NA-012 | rechazar | rechazo_contenido | contacto.telefono_nombre@1 | sí |
| R-NA-013 | retener | retener | odio.lista@1 | sí |
| R-NA-014 | retener | retener | odio.lista@1 | sí |
| R-NA-015 | retener | retener | odio.lista@1 | sí |

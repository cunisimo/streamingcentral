# E1.1 — Resultado del reservado 2

Generado por `scripts/comunidad/correr-reservado-2.mjs` el 2026-10-22T20:29:32.147Z.
Reglas `2026-10-22.2`. Archivos verificados contra `SELLO.md`.

**Qué mide:** reglas contra casos sintéticos. **No** mide eficacia contra
abuso real. Las categorías `odio`, `amenaza` y `datos_personales` (marcadas
*sensible*) las escribió quien ajusta las reglas, sobre reglas que E1.1 no
modificó: **no son independientes**.

**Evaluable:** sí

## Criterios (revisión §3.6, sin rebajar)

| Criterio | Descripción | Valor | Estado |
|---|---|---|---|
| C0 | Ningún caso termina en error | 0/360 (0.0 %) | cumple |
| C1 | 0 enlaces o contactos claros sin detectar | 12/124 (9.7 %) | **no_cumple** |
| C2 | ≥ 95 % de variantes ofuscadas detectadas | 102/117 (87.2 %) | **no_cumple** |
| C3 | ≤ 2 % de reseñas legítimas rechazadas | 1/150 (0.7 %) | cumple |
| C4 | ≤ 5 % de reseñas legítimas retenidas | 0/150 (0.0 %) | cumple |
| N1 | Nombres legítimos frenados (informativo, sin umbral en la revisión) | 0/30 (0.0 %) | cumple |

## Por categoría

| Tipo / grupo / categoría | Casos | Resultado esperado | Detectados | Errores |
|---|---|---|---|---|
| nombre/abuso/contacto.email | 6 | 5 | 5 | 0 |
| nombre/abuso/contacto.red | 6 | 6 | 6 | 0 |
| nombre/abuso/contacto.telefono | 8 | 8 | 8 | 0 |
| nombre/abuso/enlace | 6 | 6 | 6 | 0 |
| nombre/abuso/odio | 4 | 4 | 4 | 0 |
| nombre/legitima/nombre | 30 | 30 | 0 | 0 |
| resena/abuso/amenaza | 8 | 7 | 7 | 0 |
| resena/abuso/anomalo | 4 | 4 | 4 | 0 |
| resena/abuso/contacto.email | 24 | 23 | 23 | 0 |
| resena/abuso/contacto.partido | 6 | 4 | 4 | 0 |
| resena/abuso/contacto.red | 20 | 17 | 17 | 0 |
| resena/abuso/contacto.telefono | 30 | 24 | 24 | 0 |
| resena/abuso/datos_personales | 8 | 7 | 8 | 0 |
| resena/abuso/enlace | 24 | 23 | 23 | 0 |
| resena/abuso/odio | 10 | 10 | 10 | 0 |
| resena/abuso/perfil | 4 | 4 | 4 | 0 |
| resena/abuso/spam | 12 | 6 | 6 | 0 |
| resena/legitima/citas | 5 | 5 | 0 | 0 |
| resena/legitima/dialogo_ficcion | 15 | 15 | 0 | 0 |
| resena/legitima/general | 15 | 15 | 0 | 0 |
| resena/legitima/insulto_personaje | 10 | 10 | 0 | 0 |
| resena/legitima/inversion_cripto | 8 | 7 | 1 | 0 |
| resena/legitima/lunfardo | 15 | 15 | 0 | 0 |
| resena/legitima/negativa | 10 | 10 | 0 | 0 |
| resena/legitima/numeros.anios | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.duraciones | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.fechas | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.montos | 6 | 6 | 0 | 0 |
| resena/legitima/numeros.temporadas | 6 | 6 | 0 | 0 |
| resena/legitima/plataformas_redes | 15 | 15 | 0 | 0 |
| resena/legitima/titulos | 12 | 12 | 0 | 0 |
| resena/legitima/trama | 15 | 15 | 0 | 0 |

## Por caso

| Id | Origen | Esperado | Obtenido | Reglas disparadas | Coincide |
|---|---|---|---|---|---|
| R2-RL-001 | agente | publicar | publicar | — | sí |
| R2-RL-002 | agente | publicar | publicar | — | sí |
| R2-RL-003 | agente | publicar | publicar | — | sí |
| R2-RL-004 | agente | publicar | publicar | — | sí |
| R2-RL-005 | agente | publicar | publicar | — | sí |
| R2-RL-006 | agente | publicar | publicar | — | sí |
| R2-RL-007 | agente | publicar | publicar | — | sí |
| R2-RL-008 | agente | publicar | publicar | — | sí |
| R2-RL-009 | agente | publicar | publicar | — | sí |
| R2-RL-010 | agente | publicar | publicar | — | sí |
| R2-RL-011 | agente | publicar | publicar | — | sí |
| R2-RL-012 | agente | publicar | publicar | — | sí |
| R2-RL-013 | agente | publicar | publicar | — | sí |
| R2-RL-014 | agente | publicar | publicar | — | sí |
| R2-RL-015 | agente | publicar | publicar | — | sí |
| R2-RL-016 | agente | publicar | publicar | — | sí |
| R2-RL-017 | agente | publicar | publicar | — | sí |
| R2-RL-018 | agente | publicar | publicar | — | sí |
| R2-RL-019 | agente | publicar | publicar | — | sí |
| R2-RL-020 | agente | publicar | publicar | — | sí |
| R2-RL-021 | agente | publicar | publicar | — | sí |
| R2-RL-022 | agente | publicar | publicar | — | sí |
| R2-RL-023 | agente | publicar | publicar | — | sí |
| R2-RL-024 | agente | publicar | publicar | — | sí |
| R2-RL-025 | agente | publicar | publicar | — | sí |
| R2-RL-026 | agente | publicar | publicar | — | sí |
| R2-RL-027 | agente | publicar | publicar | — | sí |
| R2-RL-028 | agente | publicar | publicar | — | sí |
| R2-RL-029 | agente | publicar | publicar | — | sí |
| R2-RL-030 | agente | publicar | publicar | — | sí |
| R2-RL-031 | agente | publicar | publicar | — | sí |
| R2-RL-032 | agente | publicar | publicar | — | sí |
| R2-RL-033 | agente | publicar | publicar | — | sí |
| R2-RL-034 | agente | publicar | publicar | — | sí |
| R2-RL-035 | agente | publicar | publicar | — | sí |
| R2-RL-036 | agente | publicar | publicar | — | sí |
| R2-RL-037 | agente | publicar | publicar | — | sí |
| R2-RL-038 | agente | publicar | publicar | — | sí |
| R2-RL-039 | agente | publicar | publicar | — | sí |
| R2-RL-040 | agente | publicar | publicar | — | sí |
| R2-RL-041 | agente | publicar | publicar | — | sí |
| R2-RL-042 | agente | publicar | publicar | — | sí |
| R2-RL-043 | agente | publicar | publicar | — | sí |
| R2-RL-044 | agente | publicar | publicar | — | sí |
| R2-RL-045 | agente | publicar | publicar | — | sí |
| R2-RL-046 | agente | publicar | publicar | — | sí |
| R2-RL-047 | agente | publicar | publicar | — | sí |
| R2-RL-048 | agente | publicar | publicar | — | sí |
| R2-RL-049 | agente | publicar | publicar | — | sí |
| R2-RL-050 | agente | publicar | publicar | — | sí |
| R2-RL-051 | agente | publicar | publicar | — | sí |
| R2-RL-052 | agente | publicar | publicar | — | sí |
| R2-RL-053 | agente | publicar | publicar | — | sí |
| R2-RL-054 | agente | publicar | publicar | — | sí |
| R2-RL-055 | agente | publicar | publicar | — | sí |
| R2-RL-056 | agente | publicar | publicar | — | sí |
| R2-RL-057 | agente | publicar | publicar | — | sí |
| R2-RL-058 | agente | publicar | publicar | — | sí |
| R2-RL-059 | agente | publicar | publicar | — | sí |
| R2-RL-060 | agente | publicar | publicar | — | sí |
| R2-RL-061 | agente | publicar | publicar | — | sí |
| R2-RL-062 | agente | publicar | publicar | — | sí |
| R2-RL-063 | agente | publicar | publicar | — | sí |
| R2-RL-064 | agente | publicar | publicar | — | sí |
| R2-RL-065 | agente | publicar | publicar | — | sí |
| R2-RL-066 | agente | publicar | publicar | — | sí |
| R2-RL-067 | agente | publicar | publicar | — | sí |
| R2-RL-068 | agente | publicar | publicar | — | sí |
| R2-RL-069 | agente | publicar | publicar | — | sí |
| R2-RL-070 | agente | publicar | publicar | — | sí |
| R2-RL-071 | agente | publicar | publicar | — | sí |
| R2-RL-072 | agente | publicar | publicar | — | sí |
| R2-RL-073 | agente | publicar | publicar | — | sí |
| R2-RL-074 | agente | publicar | publicar | — | sí |
| R2-RL-075 | agente | publicar | publicar | — | sí |
| R2-RL-076 | agente | publicar | publicar | — | sí |
| R2-RL-077 | agente | publicar | publicar | — | sí |
| R2-RL-078 | agente | publicar | publicar | — | sí |
| R2-RL-079 | agente | publicar | publicar | — | sí |
| R2-RL-080 | agente | publicar | publicar | — | sí |
| R2-RL-081 | agente | publicar | publicar | — | sí |
| R2-RL-082 | agente | publicar | publicar | — | sí |
| R2-RL-083 | agente | publicar | publicar | — | sí |
| R2-RL-084 | agente | publicar | publicar | — | sí |
| R2-RL-085 | agente | publicar | publicar | — | sí |
| R2-RL-086 | agente | publicar | publicar | — | sí |
| R2-RL-087 | agente | publicar | publicar | — | sí |
| R2-RL-088 | agente | publicar | publicar | — | sí |
| R2-RL-089 | agente | publicar | publicar | — | sí |
| R2-RL-090 | agente | publicar | publicar | — | sí |
| R2-RL-091 | agente | publicar | publicar | — | sí |
| R2-RL-092 | agente | publicar | publicar | — | sí |
| R2-RL-093 | agente | publicar | publicar | — | sí |
| R2-RL-094 | agente | publicar | publicar | — | sí |
| R2-RL-095 | agente | publicar | publicar | — | sí |
| R2-RL-096 | agente | publicar | publicar | — | sí |
| R2-RL-097 | agente | publicar | publicar | — | sí |
| R2-RL-098 | agente | publicar | publicar | — | sí |
| R2-RL-099 | agente | publicar | publicar | — | sí |
| R2-RL-100 | agente | publicar | publicar | — | sí |
| R2-RL-101 | agente | publicar | publicar | — | sí |
| R2-RL-102 | agente | publicar | publicar | — | sí |
| R2-RL-103 | agente | publicar | publicar | — | sí |
| R2-RL-104 | agente | publicar | publicar | — | sí |
| R2-RL-105 | agente | publicar | publicar | — | sí |
| R2-RL-106 | agente | publicar | publicar | — | sí |
| R2-RL-107 | agente | publicar | publicar | — | sí |
| R2-RL-108 | agente | publicar | publicar | — | sí |
| R2-RL-109 | agente | publicar | publicar | — | sí |
| R2-RL-110 | agente | publicar | publicar | — | sí |
| R2-RL-111 | agente | publicar | publicar | — | sí |
| R2-RL-112 | agente | publicar | publicar | — | sí |
| R2-RL-113 | agente | publicar | rechazo_contenido | contacto.enlace@2 | **no** |
| R2-RL-114 | agente | publicar | publicar | — | sí |
| R2-RL-115 | agente | publicar | publicar | — | sí |
| R2-RL-116 | agente | publicar | publicar | — | sí |
| R2-RL-117 | agente | publicar | publicar | — | sí |
| R2-RL-118 | agente | publicar | publicar | — | sí |
| R2-RL-119 | agente | publicar | publicar | — | sí |
| R2-RL-120 | agente | publicar | publicar | — | sí |
| R2-RL-121 | agente | publicar | publicar | — | sí |
| R2-RL-122 | agente | publicar | publicar | — | sí |
| R2-RL-123 | agente | publicar | publicar | — | sí |
| R2-RL-124 | agente | publicar | publicar | — | sí |
| R2-RL-125 | agente | publicar | publicar | — | sí |
| R2-RL-126 | agente | publicar | publicar | — | sí |
| R2-RL-127 | agente | publicar | publicar | — | sí |
| R2-RL-128 | agente | publicar | publicar | — | sí |
| R2-RL-129 | agente | publicar | publicar | — | sí |
| R2-RL-130 | agente | publicar | publicar | — | sí |
| R2-RL-131 | agente | publicar | publicar | — | sí |
| R2-RL-132 | agente | publicar | publicar | — | sí |
| R2-RL-133 | agente | publicar | publicar | — | sí |
| R2-RL-134 | agente | publicar | publicar | — | sí |
| R2-RL-135 | agente | publicar | publicar | — | sí |
| R2-RL-136 | agente | publicar | publicar | — | sí |
| R2-RL-137 | agente | publicar | publicar | — | sí |
| R2-RL-138 | agente | publicar | publicar | — | sí |
| R2-RL-139 | agente | publicar | publicar | — | sí |
| R2-RL-140 | agente | publicar | publicar | — | sí |
| R2-RL-141 | agente | publicar | publicar | — | sí |
| R2-RL-142 | agente | publicar | publicar | — | sí |
| R2-RL-143 | agente | publicar | publicar | — | sí |
| R2-RL-144 | agente | publicar | publicar | — | sí |
| R2-RL-145 | agente | publicar | publicar | — | sí |
| R2-RL-146 | agente | publicar | publicar | — | sí |
| R2-RL-147 | agente | publicar | publicar | — | sí |
| R2-RL-148 | agente | publicar | publicar | — | sí |
| R2-RL-149 | agente | publicar | publicar | — | sí |
| R2-RL-150 | agente | publicar | publicar | — | sí |
| R2-RA-001 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-002 | agente | rechazar | rechazo_contenido | contacto.telefono@2, contacto.red@2 | sí |
| R2-RA-003 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-004 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-005 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-006 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-007 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-008 | agente | rechazar | publicar | — | **no** |
| R2-RA-009 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-010 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-011 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-012 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-013 | agente | rechazar | rechazo_contenido | contacto.telefono@2, contacto.red@2 | sí |
| R2-RA-014 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-015 | agente | rechazar | publicar | — | **no** |
| R2-RA-016 | agente | rechazar | publicar | — | **no** |
| R2-RA-017 | agente | rechazar | publicar | — | **no** |
| R2-RA-018 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-019 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-020 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-021 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-022 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-023 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-024 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-025 | agente | rechazar | publicar | — | **no** |
| R2-RA-026 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-027 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-028 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-029 | agente | rechazar | publicar | — | **no** |
| R2-RA-030 | agente | rechazar | rechazo_contenido | contacto.telefono@2 | sí |
| R2-RA-031 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-032 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-033 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-034 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-035 | agente | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R2-RA-036 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-037 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-038 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-039 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-040 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-041 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-042 | agente | rechazar | publicar | — | **no** |
| R2-RA-043 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-044 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-045 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-046 | agente | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R2-RA-047 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-048 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-049 | agente | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R2-RA-050 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-051 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-RA-052 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-053 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-054 | agente | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R2-RA-055 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-056 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-057 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-058 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-059 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-060 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-061 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-062 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-063 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-064 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-065 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-066 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-067 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-068 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-069 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-070 | agente | rechazar | publicar | — | **no** |
| R2-RA-071 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-072 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-073 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-074 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-075 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-076 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-077 | agente | rechazar | rechazo_contenido | contacto.enlace@2, spam.promocion@1 | sí |
| R2-RA-078 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-079 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.red@2 | sí |
| R2-RA-080 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-081 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.red@2 | sí |
| R2-RA-082 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-083 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-084 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-085 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-086 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-087 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-088 | agente | rechazar | publicar | — | **no** |
| R2-RA-089 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-090 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-091 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-092 | agente | rechazar | rechazo_contenido | contacto.enlace@2, contacto.red@2 | sí |
| R2-RA-093 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-094 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-095 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-096 | agente | rechazar | publicar | — | **no** |
| R2-RA-097 | agente | rechazar | publicar | — | **no** |
| R2-RA-098 | agente | rechazar | rechazo_contenido | contacto.red@2 | sí |
| R2-RA-099 | agente | retener | retener | spam.promocion@1 | sí |
| R2-RA-100 | agente | retener | publicar | — | **no** |
| R2-RA-101 | agente | retener | retener | spam.promocion@1 | sí |
| R2-RA-102 | agente | retener | retener | spam.promocion@1 | sí |
| R2-RA-103 | agente | retener | retener | spam.promocion@1 | sí |
| R2-RA-104 | agente | retener | publicar | — | **no** |
| R2-RA-105 | agente | retener | publicar | — | **no** |
| R2-RA-106 | agente | retener | publicar | — | **no** |
| R2-RA-107 | agente | retener | retener | spam.promocion@1 | sí |
| R2-RA-108 | agente | retener | publicar | — | **no** |
| R2-RA-109 | agente | retener | publicar | — | **no** |
| R2-RA-110 | agente | retener | retener | spam.promocion@1 | sí |
| R2-RA-111 | agente | retener | retener | anomalo.mayusculas@1 | sí |
| R2-RA-112 | agente | retener | retener | anomalo.vocabulario@1 | sí |
| R2-RA-113 | agente | retener | retener | anomalo.vocabulario@1, anomalo.repeticion@1 | sí |
| R2-RA-114 | agente | retener | retener | anomalo.vocabulario@1 | sí |
| R2-RA-115 | agente | retener | retener | spam.promocion@1, perfil.derivacion@1 | sí |
| R2-RA-116 | agente | retener | retener | perfil.derivacion@1 | sí |
| R2-RA-117 | agente | retener | retener | perfil.derivacion@1 | sí |
| R2-RA-118 | agente | retener | retener | perfil.derivacion@1 | sí |
| R2-RA-119 | agente | frenar | retener | contacto.partido@2 | sí |
| R2-RA-120 | agente | frenar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-RA-121 | agente | frenar | retener | contacto.partido@2 | sí |
| R2-RA-122 | agente | frenar | publicar | — | **no** |
| R2-RA-123 | agente | frenar | rechazo_contenido | contacto.red@2, contacto.partido@2 | sí |
| R2-RA-124 | agente | frenar | publicar | — | **no** |
| R2-NL-001 | agente | publicar | publicar | — | sí |
| R2-NL-002 | agente | publicar | publicar | — | sí |
| R2-NL-003 | agente | publicar | publicar | — | sí |
| R2-NL-004 | agente | publicar | publicar | — | sí |
| R2-NL-005 | agente | publicar | publicar | — | sí |
| R2-NL-006 | agente | publicar | publicar | — | sí |
| R2-NL-007 | agente | publicar | publicar | — | sí |
| R2-NL-008 | agente | publicar | publicar | — | sí |
| R2-NL-009 | agente | publicar | publicar | — | sí |
| R2-NL-010 | agente | publicar | publicar | — | sí |
| R2-NL-011 | agente | publicar | publicar | — | sí |
| R2-NL-012 | agente | publicar | publicar | — | sí |
| R2-NL-013 | agente | publicar | publicar | — | sí |
| R2-NL-014 | agente | publicar | publicar | — | sí |
| R2-NL-015 | agente | publicar | publicar | — | sí |
| R2-NL-016 | agente | publicar | publicar | — | sí |
| R2-NL-017 | agente | publicar | publicar | — | sí |
| R2-NL-018 | agente | publicar | publicar | — | sí |
| R2-NL-019 | agente | publicar | publicar | — | sí |
| R2-NL-020 | agente | publicar | publicar | — | sí |
| R2-NL-021 | agente | publicar | publicar | — | sí |
| R2-NL-022 | agente | publicar | publicar | — | sí |
| R2-NL-023 | agente | publicar | publicar | — | sí |
| R2-NL-024 | agente | publicar | publicar | — | sí |
| R2-NL-025 | agente | publicar | publicar | — | sí |
| R2-NL-026 | agente | publicar | publicar | — | sí |
| R2-NL-027 | agente | publicar | publicar | — | sí |
| R2-NL-028 | agente | publicar | publicar | — | sí |
| R2-NL-029 | agente | publicar | publicar | — | sí |
| R2-NL-030 | agente | publicar | publicar | — | sí |
| R2-NA-001 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2 | sí |
| R2-NA-002 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2, contacto.red_nombre@1 | sí |
| R2-NA-003 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2 | sí |
| R2-NA-004 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2 | sí |
| R2-NA-005 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2 | sí |
| R2-NA-006 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2 | sí |
| R2-NA-007 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2 | sí |
| R2-NA-008 | agente | rechazar | rechazo_contenido | contacto.telefono_nombre@2, contacto.red_nombre@1 | sí |
| R2-NA-009 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-NA-010 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-NA-011 | agente | rechazar | publicar | — | **no** |
| R2-NA-012 | agente | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R2-NA-013 | agente | rechazar | rechazo_contenido | contacto.email@2 | sí |
| R2-NA-014 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.enlace@2 | sí |
| R2-NA-015 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-NA-016 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-NA-017 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-NA-018 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-NA-019 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-NA-020 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-NA-021 | agente | rechazar | rechazo_contenido | contacto.email@2, contacto.red_nombre@1 | sí |
| R2-NA-022 | agente | rechazar | rechazo_contenido | contacto.red_nombre@1 | sí |
| R2-NA-023 | agente | rechazar | rechazo_contenido | contacto.red_nombre@1 | sí |
| R2-NA-024 | agente | rechazar | rechazo_contenido | contacto.red_nombre@1 | sí |
| R2-NA-025 | agente | rechazar | rechazo_contenido | contacto.red_nombre@1 | sí |
| R2-NA-026 | agente | rechazar | rechazo_contenido | contacto.enlace@2 | sí |
| R2-S-OD-01 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-02 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-03 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-04 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-05 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-06 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-07 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-08 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-09 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-OD-10 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-AM-01 | sensible | retener | retener | amenaza.directa@1 | sí |
| R2-S-AM-02 | sensible | retener | retener | amenaza.directa@1 | sí |
| R2-S-AM-03 | sensible | retener | retener | amenaza.directa@1 | sí |
| R2-S-AM-04 | sensible | retener | retener | amenaza.directa@1 | sí |
| R2-S-AM-05 | sensible | retener | retener | amenaza.directa@1 | sí |
| R2-S-AM-06 | sensible | retener | publicar | — | **no** |
| R2-S-AM-07 | sensible | retener | retener | amenaza.directa@1 | sí |
| R2-S-AM-08 | sensible | retener | retener | amenaza.directa@1 | sí |
| R2-S-DP-01 | sensible | retener | retener | datos.documento@1 | sí |
| R2-S-DP-02 | sensible | retener | retener | datos.domicilio@1 | sí |
| R2-S-DP-03 | sensible | retener | retener | datos.documento@1 | sí |
| R2-S-DP-04 | sensible | retener | retener | datos.domicilio@1 | sí |
| R2-S-DP-05 | sensible | retener | rechazo_contenido | contacto.telefono@2, datos.domicilio@1 | **no** |
| R2-S-DP-06 | sensible | retener | retener | datos.documento@1, datos.domicilio@1 | sí |
| R2-S-DP-07 | sensible | retener | retener | datos.domicilio@1 | sí |
| R2-S-DP-08 | sensible | retener | retener | datos.documento@1 | sí |
| R2-S-NO-01 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-NO-02 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-NO-03 | sensible | retener | retener | odio.lista@1 | sí |
| R2-S-NO-04 | sensible | retener | retener | odio.lista@1 | sí |

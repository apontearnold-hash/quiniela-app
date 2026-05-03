# API-Football — Diagnóstico y Oportunidades

> Documento de referencia. No representa cambios de código.
> Última actualización: 2026-04-29

---

## A. Estado actual

### Endpoints en uso

| Endpoint | Parámetros | Propósito | Archivo |
|---|---|---|---|
| `GET /fixtures` | `league=1&season=2026` | Importar los 104 partidos del Mundial | `app/api/admin/sync/route.ts` |
| `GET /fixtures` | `league=1&season=2026` | Actualizar scores y status durante el torneo | `app/api/admin/sync/results/route.ts` |
| `GET /fixtures` | `league=1&season=2026&live=all` | Partidos en vivo para la UI del torneo | `app/api/tournament/data/route.ts` |
| `GET /fixtures` | `league=1&season=2026&next=12` | Próximos 12 partidos | `app/api/tournament/data/route.ts` |
| `GET /standings` | `league=1&season=2026` | Posiciones de grupos en vivo | `app/api/tournament/data/route.ts` |
| `GET /standings` | `league={conf}&season={year}` | Posiciones en liga de clasificación por confederación | `app/api/teams/[teamId]/context/route.ts` |
| `GET /fixtures` | `league={conf}&season={year}&team={id}&last=5` | Últimos 5 partidos de un equipo (clasificación) | `app/api/teams/[teamId]/context/route.ts` |
| `GET /players/topscorers` | `league={conf}&season={year}` | Goleadores de liga de clasificación | `app/api/teams/[teamId]/context/route.ts` |
| `GET /players/squads` | `team={teamId}` | Plantilla de una selección nacional | `app/api/players/search/route.ts` |
| `GET /players/profiles` | `search={query}` | Búsqueda global de jugadores | `app/api/players/search/route.ts` |
| `GET /fixtures/events` | `fixture={id}` | Eventos del partido (goles, tarjetas, cambios) | `app/api/fixtures/[id]/details/route.ts` |
| `GET /fixtures/statistics` | `fixture={id}` | Estadísticas del partido (posesión, tiros, etc.) | `app/api/fixtures/[id]/details/route.ts` |
| `GET /fixtures/lineups` | `fixture={id}` | Alineaciones y formaciones | `app/api/fixtures/[id]/details/route.ts` |
| `GET /leagues` | `id=1&season=2026` | Diagnóstico: verificar cobertura de la API | `app/api/admin/diagnostics/route.ts` |

### Ligas de clasificación configuradas (`lib/team-leagues.ts`)

| Liga | ID | Temporada | Confederación | Standings |
|---|---|---|---|---|
| CONMEBOL Qualifiers | 34 | 2026 | CONMEBOL | ✓ |
| UEFA Qualifiers | 32 | 2026 | UEFA | ✓ |
| AFC Qualifiers | 30 | 2026 | AFC | ✓ |
| CAF Qualifiers | 29 | 2026 | CAF | ✓ |
| CONCACAF Gold Cup | 22 | 2025 | CONCACAF | ✓ |
| OFC Qualifiers | 33 | 2026 | OFC | ✗ (solo fixtures) |

### Tablas de Supabase que reciben datos del API

| Tabla | Qué datos llegan del API | Cuándo |
|---|---|---|
| `fixtures` | Partidos completos (104 filas): equipos, kickoff, venue, scores, status, phase | Sync manual (admin) |
| `fixture_sync_log` | Auditoría de cada operación de sync: tipo, status, filas afectadas | En cada sync |
| `groups` | Posiciones por grupo (cache local); actualmente se recalcula desde `fixtures` | Después de cada resultado |

### Data que ya tenemos disponible en Supabase

- Los 104 partidos del Mundial con kickoff, venue, fase, grupo y bracket_position
- Equipos denormalizados en cada fixture: id, nombre, código ISO, flag URL
- Scores, status y result_source (api / manual / simulation)
- Historial de sincronizaciones

---

## B. Oportunidades rápidas (bajo riesgo, alto valor)

Estas oportunidades usan endpoints que ya se probaron o que la cobertura del API confirma disponibles.

### B1. Top Scorer del Mundial en vivo

**Endpoint:** `GET /players/topscorers?league=1&season=2026`

**Qué aporta:** Lista de los mejores goleadores del torneo con foto, equipo, goles, asistencias, minutos jugados.

**Uso en la app:**
- Mostrar top-5 goleadores en la página Mundial o Dashboard
- Mostrar al goleador líder en la tarjeta de cada quiniela enviada junto al bonus pick del usuario
- En el futuro: comparar la predicción del usuario con el ranking real

**Cacheo recomendado:** 30–60 min durante el torneo. Sin DB write (response directo).

---

### B2. Asistencias y estadísticas de la fase eliminatoria

**Endpoint:** `GET /players/topscorers?league=1&season=2026` (también tiene assists si el plan lo permite)

**Qué aporta:** Misma llamada que B1, con campo `statistics[0].goals.assists`.

**Uso:** Mostrar tabla combinada goles + asistencias en la página Mundial.

---

### B3. Página de equipo mejorada

**Endpoint ya en uso:** `GET /fixtures/events?fixture={id}` + `GET /fixtures/lineups?fixture={id}`

Ya existe `/api/fixtures/[id]/details` que consulta estos tres endpoints. Lo que falta es usar esa data más visualmente en la página del fixture.

**Uso:**
- Línea de tiempo de eventos (goles, tarjetas, cambios) con minuto exacto
- Alineación visual con formación (ya llega `formation`, `startXI`, `substitutes`)
- Stats de partido comparadas en barras (posesión, tiros, corners, faltas)

**Riesgo:** Estos datos solo existen para partidos terminados o en curso. Antes del torneo devuelven array vacío.

---

### B4. Próximos partidos filtrados por grupo

**Endpoint ya en uso:** `GET /fixtures?league=1&season=2026&next=12`

**Mejora:** Agregar filtros por grupo (`?round=Group+Stage+-+1`) o por equipo para mostrar el calendario por grupo de forma más ordenada.

**Uso:** En la pestaña Calendario de `/mundial`, filtrar por grupo sin llamadas adicionales si ya se cargaron todos los fixtures.

---

### B5. Resultados en tiempo real (live)

**Endpoint ya en uso:** `GET /fixtures?league=1&season=2026&live=all`

**Mejora:** Mostrar un indicador visual de "partido en vivo" con el minuto actual en el ticker del Dashboard. Ya tenemos `elapsed` en la respuesta.

**Uso:** Pulsar badge "EN VIVO · 43'" junto al score en el ticker.

---

## C. Oportunidades medias (requieren algo de trabajo, buen valor)

### C1. Estadísticas por equipo en el torneo

**Endpoint:** `GET /teams/statistics?league=1&season=2026&team={id}`

**Qué aporta:** Goles marcados/recibidos, partidos ganados/perdidos/empatados, forma (WWDLL), tiros totales, promedio de goles por partido — todo para el Mundial.

**Uso:**
- Página de detalle del equipo dentro de `/mundial`
- Comparación entre dos equipos antes de un partido

**Cacheo recomendado:** Guardar en Supabase (`team_stats` table) o cache de 1 h en memoria.

---

### C2. Jugadores por selección (roster completo)

**Endpoint ya en uso:** `GET /players/squads?team={teamId}`

Ya usamos este endpoint para el buscador de goleador bonus. La oportunidad es exponer el roster completo como sección en la página del equipo:

- Porteros / Defensas / Mediocampistas / Delanteros
- Foto, nombre, posición, número de dorsal

**Riesgo:** La cobertura del roster puede ser incompleta para selecciones de confederaciones pequeñas (OFC, etc.).

---

### C3. Head-to-Head entre dos equipos

**Endpoint:** `GET /fixtures/headtohead?h2h={teamId1}-{teamId2}`

**Qué aporta:** Historial de todos los partidos entre dos equipos, con scores, fecha y competición.

**Uso:**
- En la página del fixture antes de que jueguen: mostrar los últimos 5 enfrentamientos
- Dato curioso para el usuario al momento de hacer su predicción

**Riesgo:** Puede no incluir partidos muy antiguos. Requiere los IDs de ambos equipos (ya los tenemos en `fixtures`).

---

### C4. Injuries (bajas)

**Endpoint:** `GET /injuries?league=1&season=2026`

**Qué aporta:** Lista de jugadores con lesiones o suspensiones activas durante el torneo.

**Uso:**
- Información contextual antes de un partido
- Mostrar si el goleador favorito está lesionado

**Riesgo:** Solo disponible en planes pagos avanzados. Verificar con `/leagues?id=1&season=2026` → `coverage.injuries`.

---

### C5. Predicciones del API

**Endpoint:** `GET /predictions?fixture={id}`

**Qué aporta:** La predicción propia de la API (porcentaje de victoria local/visitante/empate, "consejos", predicción de winner). Basada en algoritmo estadístico propio del proveedor.

**Uso:**
- Mostrar como dato curioso en la página del fixture: "La API predice 67% probabilidad de victoria local"
- **No confundir con las predicciones de los usuarios de la quiniela**

**Riesgo:** Puede requerir plan específico. Los porcentajes llegan como strings ("67%"), no como números.

---

## D. Oportunidades avanzadas (mayor complejidad o incertidumbre)

### D1. Odds (cuotas de apuestas)

**Endpoint:** `GET /odds?fixture={id}` o `GET /odds/live?fixture={id}`

**Qué aporta:** Cuotas de varias casas de apuestas para el resultado del partido.

**Riesgo / limitaciones:**
- Requiere plan Premium de API-Sports (verificar)
- Las cuotas de partidos del Mundial pueden estar sujetas a restricciones legales dependiendo del país
- No es el foco de la app (es una quiniela, no apuestas)

**Posible uso:** Solo informativo como dato curiosidad ("El mercado favorece a X con cuota 1.85"). Requiere disclaimer legal.

---

### D2. Transferencias y entrenadores

**Endpoints:** `GET /transfers?player={id}`, `GET /coaches?team={id}`

**Qué aporta:** Historial de traspasos de un jugador; nombre y datos del entrenador de cada selección.

**Uso:** Enriquecer la página del equipo o del jugador con datos del DT.

**Riesgo:** Para torneos mundiales la cobertura puede ser incompleta; los seleccionadores no siempre tienen "transferencias" en la API.

---

### D3. Trofeos por jugador o equipo

**Endpoint:** `GET /trophies?player={id}` o `GET /trophies?coach={id}`

**Qué aporta:** Palmarés del jugador o entrenador.

**Uso:** Curiosidad en página de jugador. Bajo impacto para el flujo de la quiniela.

---

### D4. Clasificatorias históricas

**Endpoints:** Los mismos de clasificación (`league=34`, `32`, etc.) con `season` anterior (2022).

**Qué aporta:** Estadísticas comparativas del desempeño en clasificación de equipos que ahora están en el Mundial.

**Riesgo:** Datos históricos pueden tener cobertura incompleta. Poco relevante durante el torneo activo.

---

### D5. Venues y ciudades sede

**Endpoint:** `GET /venues?league=1&season=2026`

**Qué aporta:** Información de los 16 estadios sede: nombre, ciudad, país, capacidad, foto.

**Uso:** Enriquecer la página del fixture con datos del estadio. Ya guardamos `venue_name` y `venue_city` en la tabla `fixtures`.

**Riesgo:** Bajo. La cobertura de venues para el Mundial debería ser completa.

---

## E. Riesgos y preguntas abiertas

### E1. ¿Qué endpoints dependen del plan de API-Sports?

La respuesta de `GET /leagues?id=1&season=2026` incluye el objeto `coverage` que lista explícitamente qué está disponible. El endpoint de diagnóstico ya lo consulta. Los campos clave a revisar antes de implementar:

| Campo coverage | Endpoint asociado |
|---|---|
| `coverage.standings` | `/standings` |
| `coverage.players` | `/players/squads`, `/players/topscorers` |
| `coverage.top_scorers` | `/players/topscorers` |
| `coverage.predictions` | `/predictions` |
| `coverage.injuries` | `/injuries` |
| `coverage.statistics.fixtures` | `/fixtures/statistics` |
| `coverage.statistics.players` | `/players/statistics` |

**Acción:** Ejecutar el endpoint de diagnóstico en Admin → Sync → "Verificar" para ver qué está activo en el plan actual.

---

### E2. ¿Qué endpoints no tendrán data hasta que empiece el Mundial?

| Endpoint | Disponible antes del torneo | Notas |
|---|---|---|
| `/fixtures` (scores) | ✗ | Solo tendrá NS, sin goles |
| `/fixtures/events` | ✗ | Array vacío |
| `/fixtures/statistics` | ✗ | Array vacío |
| `/fixtures/lineups` | ✗ / parcial | Puede llegar antes del partido en algunos torneos |
| `/players/topscorers` | ✗ | Sin goles marcados |
| `/standings` (WC) | ✗ | Sin partidos jugados |
| `/injuries` | ✓ parcial | Puede tener bajas de preparación |
| `/predictions` | ✓ | La API calcula predicciones antes del partido |
| `/players/squads` | ✓ | Roster ya disponible (si el plan lo incluye) |
| `/teams/statistics` (WC) | ✗ | Sin data de torneo |
| `/odds` | ✓ | Cuotas disponibles antes del partido |

---

### E3. ¿Qué endpoints requieren otros league IDs o seasons?

- Clasificatorias: cada confederación tiene su propio `league_id` y a veces `season` diferente (CONCACAF usa Gold Cup 2025, no calificatorio directo 2026)
- Head-to-head: no requiere `league`, solo los IDs de los dos equipos
- Trophies/Transfers/Coaches: usan IDs de jugadores o equipo, no de liga

---

### E4. ¿Qué conviene cachear en Supabase vs. consultar en vivo?

| Data | Estrategia recomendada | Razón |
|---|---|---|
| Fixtures (104 partidos) | Supabase — ya implementado | No cambia frecuentemente; es la fuente de verdad |
| Scores y status | Supabase — ya implementado | Sync manual o periódico en producción |
| Group standings (WC) | En vivo (TTL 10 min) — ya implementado | Cambia rápido durante el torneo |
| Top scorers (WC) | En vivo (TTL 30–60 min) | Cambia en cada jornada; simple de mostrar |
| Roster / squads | Supabase (tabla `team_rosters`) | Rara vez cambia; 32 equipos × ~23 jugadores = ~736 filas |
| Match events | En vivo solo si partido activo | Sin sentido cachear antes de que empiece el partido |
| Estadísticas de partido | Supabase post-partido | Una vez terminado, no cambia |
| Predictions API | En vivo (TTL 6 h) | Cambia poco; cuota de API baja |
| Head-to-head | Supabase (tabla `h2h_cache`) | Datos históricos estáticos |

---

## F. Recomendación priorizada

### Fase 1 — Bajo riesgo / Alto valor (antes o al inicio del torneo)

1. **Top Scorers en vivo** — `GET /players/topscorers?league=1&season=2026`
   - Un componente nuevo en `/mundial` con el top-5 goleadores
   - Sin DB write, sin migraciones, 1 endpoint
   
2. **Live badge en ticker** — Usar `elapsed` ya disponible en `/fixtures?live=all`
   - Ya tenemos el dato; solo es UI. Mostrar "EN VIVO · 43'"

3. **Roster del equipo** — `GET /players/squads?team={id}`
   - Ya existe el endpoint en el código. Exponer el roster en la página del equipo dentro de `/mundial`

4. **Estadísticas y eventos del partido** — `/fixtures/events` + `/fixtures/statistics`
   - El endpoint ya existe (`/api/fixtures/[id]/details`). Solo falta mejorar la UI de `/fixtures/[id]` para mostrarlo mejor

### Fase 2 — Valor medio (durante el torneo)

5. **Estadísticas por equipo** — `GET /teams/statistics?league=1&season=2026&team={id}`
   - Página de detalle del equipo en `/mundial`
   - Requiere nueva ruta de API y pequeña tabla de cache

6. **Head-to-head** — `GET /fixtures/headtohead?h2h={id1}-{id2}`
   - Mostrar en `/fixtures/[id]` antes del partido
   - Requiere nueva ruta de API; sin migraciones si se sirve en vivo

7. **Predicciones del API** — `GET /predictions?fixture={id}`
   - Dato curioso en página del fixture
   - Verificar disponibilidad en el plan actual primero

### Fase 3 — Avanzado (post-torneo o versión futura)

8. **Injuries** — `GET /injuries?league=1&season=2026` — si el plan lo permite
9. **Venues completos** — `GET /venues?league=1&season=2026`
10. **Coaches** — `GET /coaches?team={id}` para ficha del DT de cada selección
11. **Odds** — Solo si se decide agregar contexto de mercado (requiere validación legal)

---

*Para cualquier endpoint nuevo: verificar primero en Admin → Sincronización → "Verificar estado de la API" que el campo de cobertura correspondiente está activo en el plan actual.*

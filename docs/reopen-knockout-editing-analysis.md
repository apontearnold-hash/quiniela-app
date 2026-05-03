# Análisis: Reapertura de Edición para Fase Eliminatoria

> Estado: análisis / sin cambios de código
> Fecha: 2026-04-29

---

## 1. Estado actual del lock / edición

### Cómo funciona hoy

```
tournament_config.lock_date  (timestamptz, nullable)
        │
        ▼
getLockDate()   →   lib/lock-date.ts
  Priority 1: tournament_config.lock_date  (admin-controlled)
  Priority 2: midnight del día del primer kickoff de grupos (fallback dinámico)
        │
        ▼
isLocked = Date.now() >= new Date(lockDate).getTime()
        │
        ▼
effectiveLock = isLocked || readOnly   (PredictionsEditor.tsx)
```

**Un único booleano** gobierna todo: grupos, eliminatorias, bonus. No hay distinción entre fases.

### Secuencia de estados de la quiniela

| Momento | Estado quiniela | Edición |
|---|---|---|
| Antes de lock_date | `draft` o `submitted` | Todo editable |
| Después de lock_date | `submitted` | Todo bloqueado |
| Hoy no existe | — | Reapertura parcial |

### Dónde está el lock en código

| Archivo | Rol |
|---|---|
| `lib/lock-date.ts` | Lee `tournament_config.lock_date`; fallback a primer kickoff |
| `app/quiniela/[id]/edit/page.tsx:77` | Calcula `isLocked`, lo pasa a `PredictionsEditor` y `BonusEditor` |
| `components/PredictionsEditor.tsx:412` | `isLocked → effectiveLock` bloquea todos los inputs |
| `components/BonusEditor.tsx` | Recibe `isLocked` por prop, bloquea bonus |
| `app/api/admin/config/route.ts` | GET/POST de `tournament_config` (price + lock_date) |

---

## 2. Estado actual del scoring por fase

### Multiplicadores definidos (`lib/types.ts:153`)

```typescript
export const PHASE_MULTIPLIER: Record<Phase, number> = {
  groups:        1,
  round_of_32:   2,
  round_of_16:   3,
  quarterfinals: 4,
  semifinals:    5,
  final:         6,
}
```

Rango actual: **1× a 6×** (diferencia de 6× entre grupos y final).

### Fórmula de puntos (`lib/scoring.ts`)

```
puntos = (base + bonus_diff) × multiplier + penalty_bonus

  base:
    Resultado exacto:       5 pts
    Ganador/empate correcto: 2 pts
    + Diferencia de goles correcta: +1 pt adicional

  penalty_bonus (solo eliminatorias):
    Predijo que va a penales:  +3 pts
    Además acertó ganador:     +5 pts adicionales

  bonus (en quinielas, no en predictions):
    Goleador correcto:        20 pts
    Equipo más goles:         15 pts
```

### Distribución teórica de puntos máximos (Mundial 2026)

| Fase | Partidos | Pts máx/partido | Total máx |
|---|---|---|---|
| Grupos (×1) | 72 | 5 | **360** |
| Round of 32 (×2) | 16 | 10 | **160** |
| Octavos (×3) | 8 | 15 | **120** |
| Cuartos (×4) | 4 | 20 | **80** |
| Semis (×5) | 3 | 25 | **75** |
| Final (×6) | 1 | 30 | **30** |
| **Total predicciones** | **104** | — | **825** |
| Bonus (goleador+equipo) | — | — | **35** |
| **Total absoluto** | — | — | **860** |

Con multiplicadores actuales:
- **Grupos representan el 43.6%** del total máximo (360/825)
- **Eliminatorias representan el 56.4%** (465/825)

### Advertencia crítica: bracket_picks scoring NO está implementado

```typescript
// lib/recalculate.ts:92
// ── Knockout bracket_picks scoring: reserved for Phase 2 ──
// bracket_picks.points_earned stays 0 until that data is available.
```

**Hoy todos los puntos de eliminatorias valen 0** — el motor `recalculateAllPoints` solo procesa la tabla `predictions` (vinculada a fixtures reales por `fixture_id`). Las `bracket_picks` se guardan pero no se puntúan. Esto debe resolverse antes de lanzar cualquier reapertura.

---

## 3. Recomendación de multiplicadores

### Problema con los multiplicadores actuales

Con un rango 1×–6× y reapertura, alguien que editó sus eliminatorias tiene ventaja desproporcionada:

- Un jugador que acertó todos los grupos (360 pts) vs alguien que falló todo pero luego editó eliminatorias perfectas (465 pts): **el segundo ganaría** solo con la ventaja de editar más tarde.
- Eso hace irrelevante el esfuerzo inicial y convierte la reapertura en una "segunda quiniela encubierta".

### Propuesta de multiplicadores moderados

| Fase | Actual | Propuesto | Razón |
|---|---|---|---|
| Grupos (×) | 1 | 1 | Ancla — no cambiar |
| Round of 32 | 2 | 1.25 | Reducir ventaja de reapertura |
| Octavos | 3 | 1.5 | Mantener progresión suave |
| Cuartos | 4 | 1.75 | Partidos de alta calidad |
| Semis | 5 | 2 | Valor real sin ser absurdo |
| Final | 6 | 2.5 | Clímax del torneo |

### Distribución con multiplicadores propuestos

| Fase | Partidos | Pts máx/partido | Total máx |
|---|---|---|---|
| Grupos (×1) | 72 | 5 | **360** |
| Round of 32 (×1.25) | 16 | 6.25 | **100** |
| Octavos (×1.5) | 8 | 7.5 | **60** |
| Cuartos (×1.75) | 4 | 8.75 | **35** |
| Semis (×2) | 3 | 10 | **30** |
| Final (×2.5) | 1 | 12.5 | **12.5** |
| **Total** | — | — | **597.5** |

Con multiplicadores moderados:
- **Grupos: 60.3%** del total (vs 43.6% hoy)
- **Eliminatorias: 39.7%** (vs 56.4% hoy)

La fase de grupos mantiene su peso predominante, la reapertura no puede revertir resultados dramáticamente, pero las rondas avanzadas siguen siendo emocionantes.

### Balance de oportunidad de comeback

Con el escenario de reapertura + multiplicadores moderados:
- Alguien que sumó 0 en grupos (muy malo) y acierta todo en eliminatorias: **~238 pts**
- Alguien que fue perfecto en grupos y regular en eliminatorias: **360 + ~120 = ~480 pts**
- **El buen trabajo en grupos no puede ser borrado**, pero hay comeback real.

---

## 4. Campos y configuración necesarios

### Tabla `tournament_config` (cambio mínimo)

Agregar **una sola columna**:

```sql
ALTER TABLE public.tournament_config
  ADD COLUMN IF NOT EXISTS knockout_lock_date timestamptz DEFAULT NULL;
```

Semántica:
- `NULL` → reapertura nunca activada; eliminatorias bloqueadas
- Fecha en el **futuro** → ventana de edición activa
- Fecha en el **pasado** → ventana cerrada; eliminatorias bloqueadas de nuevo

No se necesita un booleano separado de "habilitado" — la fecha hace de interruptor.

### Nuevo helper `lib/lock-date.ts`

```typescript
// Nuevo export (no toca getLockDate existente)
export async function getKnockoutLockDate(
  supabase: SupabaseClient,
): Promise<string | null>
```

Lógica: leer `tournament_config.knockout_lock_date`.
- Si es null → return null (bloqueado)
- Si es una fecha → return esa fecha (el consumidor calcula si está en futuro o pasado)

### Variables de entorno / configuración

Ninguna nueva — todo vive en `tournament_config`.

---

## 5. Validaciones necesarias

### En el servidor (API de guardado de bracket_picks)

```
Al intentar guardar un bracket_pick:

1. ¿Está autenticado?
   → 401 si no

2. ¿La quiniela pertenece al usuario?
   → 403 si no

3. ¿Está tournament_config.lock_date en el pasado?
   → Si NO: la quiniela sigue en fase pre-torneo; usar flujo normal
   → Si SÍ: pasar a las siguientes validaciones

4. ¿Está tournament_config.knockout_lock_date seteado y en el FUTURO?
   → Si NO: rechazar (403 / "Edición de eliminatorias no disponible")
   → Si SÍ: continuar

5. ¿El fixture con bracket_position = slot_key tiene kickoff en el FUTURO?
   → Si NO: rechazar (422 / "Este partido ya comenzó")
   → Si SÍ: permitir guardar
```

### En el servidor (ruta de edición de bonus)

Verificar que la ruta de guardado de bonus (`BonusEditor`) rechace explícitamente cambios si `lock_date` ya pasó, independientemente de `knockout_lock_date`.

El bonus NO reabre con la ventana de eliminatorias.

### En el cliente (UX preventiva)

- Inputs de grupos: `disabled` si `lock_date` pasó (ya existente)
- Inputs de bonus: `disabled` si `lock_date` pasó (ya existente)
- Inputs de bracket_picks: `disabled` si fuera de ventana de reapertura (nuevo)
- Mostrar contador "Edición cierra en X días" si ventana está abierta

---

## 6. Cambios de UI necesarios

### `components/PredictionsEditor.tsx`

Nueva prop: `knockoutEditable: boolean`

Lógica de lock separada por tipo de fixture:

```typescript
// Hoy:
const effectiveLock = isLocked || readOnly

// Con reapertura:
const groupsLocked    = isLocked || readOnly
const knockoutLocked  = !knockoutEditable || readOnly

// Usar groupsLocked para CompactGroupRow
// Usar knockoutLocked para BracketMatchCard
```

Banner de estado en la sección de eliminatorias:
- Ventana abierta: `"⏳ Edición de eliminatorias abierta hasta [fecha/hora CT]"`
- Ventana cerrada (post-lock_date): `"🔒 Eliminatorias bloqueadas"`

### `app/quiniela/[id]/edit/page.tsx`

- Fetch adicional de `knockout_lock_date` de `tournament_config`
- Calcular `knockoutEditable = knockoutLockDate && Date.now() < new Date(knockoutLockDate)`
- Pasar como prop a `PredictionsEditor`

### Página de vista de quiniela (`/quiniela/[id]`)

Agregar aviso visible si la ventana está abierta:
`"📝 Puedes actualizar tus predicciones de eliminatoria hasta el [fecha]"`
Enlace directo al edit.

---

## 7. Cambios de Admin necesarios

### Panel Admin → pestaña Configuración

Nuevo campo en el formulario:

```
Reapertura eliminatorias — cierra el:
[ date-time input ]  [Activar]  [Borrar]
```

Comportamiento:
- Si se deja vacío o se borra → `knockout_lock_date = null`
- Si se guarda con fecha → `knockout_lock_date = fecha`
- Validación: no permitir setear fecha anterior a `lock_date` (no tendría sentido abrir eliminatorias antes de cerrar grupos)

### API `app/api/admin/config/route.ts`

Aceptar `knockout_lock_date` en el POST y aplicar misma lógica que `lock_date`:

```typescript
const { quiniela_price, currency, lock_date, knockout_lock_date } = await request.json()
// ...
if (knockout_lock_date !== undefined) {
  upsertPayload.knockout_lock_date =
    knockout_lock_date === null || knockout_lock_date === ""
      ? null
      : new Date(knockout_lock_date).toISOString()
}
```

### Validación admin pre-activación

Advertir si se intenta activar la reapertura y `bracket_picks` scoring no está implementado (los usuarios editarían picks que darán 0 puntos).

---

## 8. Impacto en scoring

### Puntos ya ganados (grupos)

**No se tocan.** `predictions` table no se modifica. Los puntos de grupos acumulados antes del lock permanecen.

### Puntos de bracket_picks

El sistema ya tiene `bracket_picks` scoring marcado como "Phase 2 pending". La reapertura depende de que esto esté implementado primero.

Cuando esté listo, la lógica es:
```
Para cada bracket_pick con slot_key X:
  1. Buscar fixture donde bracket_position = X y status = "finished"
  2. Crear Prediction sintética con los campos del BracketPick
  3. Aplicar calculatePredictionScore(fixture, syntheticPred)
  4. Escribir bracket_picks.points_earned
```

Si el usuario editó sus picks durante la ventana y la ventana ya cerró, `recalculateAllPoints` simplemente puntúa la versión final guardada. No hay ambigüedad.

### Retrocompatibilidad

Si la ventana nunca se activa (`knockout_lock_date = null`), el comportamiento actual no cambia en absoluto.

---

## 9. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Lanzar reapertura antes de implementar bracket_picks scoring | Alta (tentación de hacerlo pronto) | Alto — usuarios editan y suman 0 pts | Bloquear en admin si scoring no está activo |
| Admin activa ventana demasiado tarde (algún R32 ya jugó) | Media | Medio — algunos slots editables son post-kickoff | Validación server-side por kickoff del fixture |
| Multiplicadores muy altos hacen irrelevante fase de grupos | Alta si se mantiene config actual | Alto — usuarios frustrados | Ajustar PHASE_MULTIPLIER antes de lanzar |
| Confusión del usuario: "¿puedo editar grupos?" | Alta | Bajo — UX issue | Banner claro diferenciando qué está editable |
| Olvido de cerrar la ventana (admin no setea fecha de cierre) | Media | Alto — usuarios editan durante el R32 | La fecha es obligatoria; no hay toggle sin fecha |
| Reapertura favorece a usuarios que "espían" resultados de grupos | Baja (no hay resultados de eliminatoria al abrir) | N/A | La ventana cierra antes del primer partido |

---

## 10. Fases de implementación

### Fase 0 — Prerequisito (implementar antes de cualquier reapertura)
**bracket_picks scoring**
- Conectar `slot_key` → `fixture.bracket_position`
- Aplicar `calculatePredictionScore` a cada `BracketPick`
- Integrar en `recalculateAllPoints`
- Ajustar `PHASE_MULTIPLIER` a los valores moderados propuestos

Estimación: 1 sesión de trabajo moderada.

### Fase 1 — Backend (mínimo viable)
- Migración SQL: `tournament_config.knockout_lock_date`
- `lib/lock-date.ts`: añadir `getKnockoutLockDate()`
- `app/api/admin/config/route.ts`: aceptar `knockout_lock_date`
- API de guardado de bracket_picks: validar ventana + kickoff futuro

Estimación: 1 sesión.

### Fase 2 — UI usuario
- `PredictionsEditor`: prop `knockoutEditable`, lock separado por sección
- `edit/page.tsx`: fetch `knockout_lock_date`, calcular flag
- Banner de estado de ventana con countdown
- Vista de quiniela: aviso de ventana abierta

Estimación: 1 sesión.

### Fase 3 — UI admin
- Panel Configuración: nuevo campo `knockout_lock_date`
- Advertencia si bracket_picks scoring no está activo
- Confirmación antes de activar ("¿Seguro? X usuarios tienen quinielas submitted")

Estimación: media sesión.

---

## 11. Recomendaciones finales

### ¿Dentro de la misma quiniela o como competencia separada?

**Recomendación: dentro de la misma quiniela.** Razones:

1. El usuario ya está invertido (pagó, tiene posición en el ranking)
2. Una segunda quiniela fragmenta la identidad — ¿en cuál te enfocas?
3. El ranking principal mantiene coherencia: grupo fuerte sigue siendo ventaja
4. Implementación mucho más simple: no hay nueva tabla de "segunda quiniela", no hay pool separado, no hay doble pago

La única razón para hacer una competencia separada sería si quisieras un sistema de puntuación completamente diferente, que no es el caso aquí.

### ¿El scoring actual necesita ajustes?

**Sí, antes de lanzar reapertura.** Dos cambios necesarios:

1. **Implementar bracket_picks scoring** (pendiente Phase 2) — sin esto la reapertura es cosmética
2. **Reducir multiplicadores** de rango 1×–6× a 1×–2.5× — con el rango actual, alguien que edita todo en eliminatorias puede superar a quien lo hizo bien en grupos, lo que hace irrelevante el esfuerzo pre-torneo

### ¿Qué cambio mínimo implementar primero?

**Implementar bracket_picks scoring.** Es el prerequisito de todo lo demás y agrega valor inmediato: el ranking knockout comienza a funcionar correctamente con la quiniela original (antes de cualquier reapertura). Los cambios necesarios son:

1. `lib/recalculate.ts` — añadir bloque de scoring para `bracket_picks` usando `bracket_position` como puente
2. `lib/types.ts` — actualizar `PHASE_MULTIPLIER` a los valores moderados
3. Probar con el simulador de Admin antes de activar en producción

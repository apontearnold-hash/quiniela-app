"use client"

import { useState } from "react"
import { useLanguage, useT } from "@/components/LangProvider"
import type { Lang } from "@/lib/i18n"

// ── Bilingual content ─────────────────────────────────────────────────────────

type BiLang = { es: string; en: string }

interface Section {
  id: string
  icon: string
  title: BiLang
  bullets: BiLang[]
}

const SECTIONS: Section[] = [
  {
    id: "what",
    icon: "🏆",
    title: { es: "¿Qué es esta quiniela?", en: "What is this pool?" },
    bullets: [
      { es: "Predice los resultados de todos los partidos del Mundial 2026.", en: "Predict the results of every match in the 2026 World Cup." },
      { es: "Compite contra otros usuarios en tu liga.", en: "Compete against other users in your league." },
      { es: "Acumula puntos según tus aciertos, marcadores exactos y preguntas bonus.", en: "Earn points for correct winners, exact scores, and bonus questions." },
    ],
  },
  {
    id: "create",
    icon: "✏️",
    title: { es: "Cómo crear tu quiniela", en: "How to create a prediction" },
    bullets: [
      { es: 'Ve a "Nueva Quiniela" desde el Dashboard.', en: 'Go to "New Quiniela" from the Dashboard.' },
      { es: "Elige un nombre para tu quiniela.", en: "Pick a name for your prediction." },
      { es: "Llena fase de grupos, eliminatoria y preguntas bonus.", en: "Fill in the group stage, knockout bracket, and bonus questions." },
      { es: "Guarda como borrador o envíala cuando esté completa.", en: "Save as draft or submit when complete." },
    ],
  },
  {
    id: "draft",
    icon: "💾",
    title: { es: "Borrador vs Enviar", en: "Draft vs Submit" },
    bullets: [
      { es: "Borrador: puedes guardarla incompleta y editarla cuando quieras.", en: "Draft: save it incomplete and edit it any time." },
      { es: "Enviar: requiere todos los partidos de grupos, toda la eliminatoria, campeón elegido y bonos completos.", en: "Submit: requires all group matches, full knockout bracket, a champion pick, and bonus answers." },
      { es: "Una vez enviada, tu quiniela queda bloqueada y no puede editarse.", en: "Once submitted, your quiniela is locked and cannot be edited." },
    ],
  },
  {
    id: "groups",
    icon: "⚽",
    title: { es: "Fase de Grupos", en: "Group Stage" },
    bullets: [
      { es: "El Mundial 2026 tiene 12 grupos con 4 equipos cada uno.", en: "The 2026 World Cup has 12 groups of 4 teams each." },
      { es: "Para cada partido, escribe el marcador final que predices (ej. 2 - 1).", en: "For each match, enter your predicted final score (e.g. 2 – 1)." },
      { es: "Los partidos se bloquean automáticamente al inicio del torneo.", en: "Matches automatically lock at tournament start." },
    ],
  },
  {
    id: "knockout",
    icon: "⚡",
    title: { es: "Fase Eliminatoria", en: "Knockout Stage" },
    bullets: [
      { es: "La eliminatoria va desde la Ronda de 32 hasta la Final.", en: "The knockout stage runs from Round of 32 to the Final." },
      { es: "Si predices empate, el sistema asume automáticamente que el partido va a penales.", en: "If you predict a tie, the system automatically assumes the match goes to penalties." },
      { es: "Solo debes elegir qué equipo gana la tanda de penales; el marcador no incluye los penales.", en: "You only need to select the penalty shootout winner — the score does not include penalties." },
      { es: "Algunos equipos aparecen en blanco porque todavía dependen de resultados anteriores.", en: "Some teams show blank because they depend on earlier results." },
    ],
  },
  {
    id: "bonus",
    icon: "⭐",
    title: { es: "Preguntas Bonus", en: "Bonus Questions" },
    bullets: [
      { es: "Goleador del torneo: el jugador que más goles anote en todo el Mundial.", en: "Top scorer: the player who scores the most goals in the tournament." },
      { es: "Equipo con más goles: la selección que marque más goles en total.", en: "Most goals team: the team that scores the most goals overall." },
      { es: "Los bonos son opcionales y dan puntos extra si aciertas.", en: "Bonus questions are optional and give extra points if correct." },
      { es: "Son editables hasta el inicio del torneo.", en: "They can be edited until the tournament starts." },
    ],
  },
  {
    id: "points",
    icon: "📊",
    title: { es: "¿Cómo se puntúa?", en: "How are points scored?" },
    bullets: [
      { es: "Resultado correcto (Acierto): aciertas quién gana o si es empate.", en: "Correct result: you predict the right winner or draw." },
      { es: "Marcador exacto: tu predicción coincide con el resultado final exacto.", en: "Exact score: your predicted score matches the final result exactly." },
      { es: "Bonus: puntos extra por acertar goleador o equipo con más goles.", en: "Bonus: extra points for the correct top scorer or most goals team." },
      { es: "Los valores de puntos por fase pueden variar según la configuración de tu liga.", en: "Points per phase may vary depending on your league's configuration." },
    ],
  },
  {
    id: "dashboard",
    icon: "🏅",
    title: { es: "Dashboard y Ranking", en: "Dashboard & Rankings" },
    bullets: [
      { es: "La tabla de posiciones muestra el ranking de todos los participantes de tu liga.", en: "The standings table shows all participants in your league ranked." },
      { es: "Aciertos: partidos donde predijiste el ganador o empate correctamente.", en: "Correct (Aciertos): matches where you predicted the right winner or draw." },
      { es: "Exactos: predicciones donde el marcador fue exacto.", en: "Exact (Exactos): predictions where the score was exactly right." },
      { es: "Desempate: más exactos → más aciertos → registro más antiguo.", en: "Tiebreak: most exact → most correct → oldest registration." },
    ],
  },
  {
    id: "leagues",
    icon: "🏟️",
    title: { es: "Ligas e Invitaciones", en: "Leagues & Invitations" },
    bullets: [
      { es: "Al registrarte con un código de invitación, entras a una liga específica.", en: "When you sign up with an invite code, you join a specific league." },
      { es: "Cada liga tiene su propio precio de entrada, pozo de premios y ranking independiente.", en: "Each league has its own entry price, prize pool, and independent ranking." },
      { es: "Solo ves las quinielas de los participantes de tu misma liga.", en: "You only see predictions from participants in your league." },
    ],
  },
]

interface FAQ { q: BiLang; a: BiLang }

const FAQS: FAQ[] = [
  {
    q: { es: "¿Puedo guardar y terminar después?", en: "Can I save and finish later?" },
    a: { es: "Sí. Guarda tu quiniela como borrador y vuelve cuando quieras antes del inicio del torneo.", en: "Yes. Save as a draft and return any time before the tournament starts." },
  },
  {
    q: { es: "¿Puedo editar mi quiniela después de enviarla?", en: "Can I edit after submitting?" },
    a: { es: "No. Una vez enviada, tu quiniela queda bloqueada. Asegúrate de que todo esté correcto antes de enviar.", en: "No. Once submitted, your prediction is locked. Make sure everything is correct before submitting." },
  },
  {
    q: { es: "¿Por qué no puedo enviar mi quiniela?", en: "Why can't I submit my quiniela?" },
    a: { es: "Necesitas completar: todos los partidos de grupos, todos los slots de la fase eliminatoria, elegir un campeón en el bracket y responder las preguntas bonus.", en: "You need to complete: all group matches, every knockout bracket slot, select a champion, and answer the bonus questions." },
  },
  {
    q: { es: "¿Qué pasa si predigo empate en la eliminatoria?", en: "What happens if I predict a tie in the knockout stage?" },
    a: { es: "El sistema asume automáticamente que el partido va a penales. Solo selecciona el equipo que gana la tanda de penales en el campo que aparece.", en: "The system automatically assumes penalties. Just select the penalty winner in the field that appears." },
  },
  {
    q: { es: "¿Por qué aparecen equipos en blanco en la fase eliminatoria?", en: "Why do some knockout teams appear blank?" },
    a: { es: "Los equipos de rondas avanzadas aún no están definidos porque dependen de los resultados de rondas anteriores. De igual forma debes llenar un marcador.", en: "Teams in advanced rounds are not yet determined as they depend on earlier results. You still need to enter a score prediction." },
  },
  {
    q: { es: '¿Qué significa "Aciertos"?', en: 'What does "Aciertos" mean?' },
    a: { es: "El número de partidos en los que predijiste correctamente el resultado: quién gana o si termina en empate.", en: "The number of matches where you correctly predicted the outcome: who wins or if it ends in a draw." },
  },
  {
    q: { es: '¿Qué son los "Exactos"?', en: 'What are "Exactos" (Exact)?' },
    a: { es: "El número de partidos donde tu predicción de marcador fue exactamente igual al resultado final (ej. predijiste 2-1 y terminó 2-1).", en: "The number of matches where your score prediction exactly matched the final result (e.g. you predicted 2-1 and it ended 2-1)." },
  },
  {
    q: { es: "¿Cómo se validan las preguntas bonus?", en: "How are bonus questions validated?" },
    a: { es: "El administrador de tu liga ingresa manualmente los ganadores al finalizar el torneo y asigna los puntos correspondientes.", en: "Your league admin manually enters the winners at the end of the tournament and awards the corresponding points." },
  },
  {
    q: { es: "¿Puedo tener más de una quiniela?", en: "Can I have more than one quiniela?" },
    a: { es: "Sí. Puedes crear múltiples quinielas dentro de la misma liga.", en: "Yes. You can create multiple quinielas within the same league." },
  },
  {
    q: { es: "¿Por qué no encuentro a un jugador al buscar el goleador?", en: "Why can't I find a player when searching for top scorer?" },
    a: { es: "Selecciona primero el equipo/país del jugador para filtrar la búsqueda. Si aun así no aparece, prueba con su apellido o variante del nombre.", en: "First select the player's team/country to filter the search. If they still don't appear, try their last name or a name variant." },
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

function pick(obj: BiLang, lang: Lang) {
  return obj[lang]
}

function FAQItem({ item, lang }: { item: FAQ; lang: Lang }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left gap-3 transition-colors hover:bg-gray-50"
        style={{ background: open ? "#f9fafb" : "white" }}
      >
        <span className="text-gray-900 text-sm font-semibold">{pick(item.q, lang)}</span>
        <span className="text-amber-500 flex-shrink-0 text-sm font-bold transition-transform"
          style={{ transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 bg-white">
          <p className="text-gray-600 text-sm leading-relaxed">{pick(item.a, lang)}</p>
        </div>
      )}
    </div>
  )
}

export default function HelpContent() {
  const t = useT()
  const { lang } = useLanguage()

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 mb-2">{t("help_page_title")}</h1>
        <p className="text-gray-600">{t("help_page_subtitle")}</p>
      </div>

      {/* Sections grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {SECTIONS.map(s => (
          <div key={s.id} className="rounded-2xl p-5 flex flex-col gap-3 bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{s.icon}</span>
              <h2 className="text-gray-900 font-bold text-sm leading-tight">{pick(s.title, lang)}</h2>
            </div>
            <ul className="flex flex-col gap-1.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600 leading-snug">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">▸</span>
                  <span>{pick(b, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* FAQ section */}
      <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm">
        <h2 className="text-gray-900 font-black text-xl mb-5">{t("help_faq_s")}</h2>
        <div className="flex flex-col gap-2">
          {FAQS.map((faq, i) => (
            <FAQItem key={i} item={faq} lang={lang} />
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center text-gray-500 text-xs mt-8">
        {lang === "es"
          ? "¿Algo no está claro? Contacta al administrador de tu liga."
          : "Something unclear? Contact your league administrator."}
      </p>
    </div>
  )
}

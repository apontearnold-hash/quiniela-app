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
    title: { es: "Cómo funciona la quiniela", en: "How the pool works" },
    bullets: [
      { es: "Predice el marcador de todos los partidos del Mundial 2026.", en: "Predict the score of every match in the 2026 World Cup." },
      { es: "Llena la fase de grupos, la eliminatoria y las dos preguntas bonus.", en: "Fill in the group stage, knockout bracket, and both bonus questions." },
      { es: "Grupos ×1 · Ronda de 32 ×1.25 · Octavos ×1.5 · Cuartos ×1.75 · Semis ×2 · Final ×2.5.", en: "Groups ×1 · R32 ×1.25 · R16 ×1.5 · QF ×1.75 · SF ×2 · Final ×2.5." },
      { es: "Compite contra los demás participantes de tu liga.", en: "Compete against the other players in your league." },
    ],
  },
  {
    id: "draft",
    icon: "💾",
    title: { es: "Guardar vs Enviar", en: "Save vs Submit" },
    bullets: [
      { es: "Borrador: guarda incompleta y edítala cuando quieras antes del cierre.", en: "Draft: save incomplete and edit any time before the deadline." },
      { es: "Para enviar necesitas: todos los grupos, toda la eliminatoria y las dos preguntas bonus.", en: "To submit you need: all group matches, the full knockout bracket, and both bonus questions." },
      { es: "Al enviar, tu quiniela aparece en el ranking y cuenta en el pozo de premios.", en: "Once submitted, your quiniela appears in the rankings and counts toward prizes." },
      { es: "Puedes seguir editando después de enviar, hasta el cierre del torneo.", en: "You can keep editing after submitting, until the tournament deadline." },
    ],
  },
  {
    id: "bonus",
    icon: "⭐",
    title: { es: "Preguntas Bonus", en: "Bonus Questions" },
    bullets: [
      { es: "Goleador del torneo: el jugador que más goles anote en todo el Mundial.", en: "Top scorer: the player who scores the most goals in the tournament." },
      { es: "Equipo con más goles: la selección que marque más goles en total.", en: "Most goals team: the team that scores the most goals overall." },
      { es: "Ambas son obligatorias para poder enviar tu quiniela.", en: "Both are required to submit your quiniela." },
      { es: "Si aciertas, sumas puntos extra. Si fallas, no se restan puntos.", en: "Correct picks earn bonus points. Wrong picks deduct nothing." },
      { es: "El admin de tu liga las valida manualmente al terminar el torneo.", en: "Your league admin validates them manually when the tournament ends." },
    ],
  },
  {
    id: "groups",
    icon: "⚽",
    title: { es: "Fase de Grupos", en: "Group Stage" },
    bullets: [
      { es: "Escribe el marcador final que predices para cada partido (ej. 2 – 1).", en: "Enter your predicted final score for each match (e.g. 2 – 1)." },
      { es: "A la derecha ves la tabla proyectada de tu grupo según tus predicciones.", en: "On the right you see your group's projected standings based on your picks." },
      { es: "Los partidos se bloquean automáticamente al cierre del torneo.", en: "Matches lock automatically at the tournament deadline." },
    ],
  },
  {
    id: "knockout",
    icon: "⚡",
    title: { es: "Fase Eliminatoria", en: "Knockout Stage" },
    bullets: [
      { es: "Va desde la Ronda de 32 hasta la Final.", en: "Runs from the Round of 32 to the Final." },
      { es: "Si predices empate: el partido va a penales. Elige quién gana la tanda.", en: "If you predict a draw: the match goes to penalties. Choose the penalty winner." },
      { es: "El marcador no incluye penales, solo el tiempo reglamentario.", en: "The score does not include penalties — regulation time only." },
      { es: "Algunos equipos aparecen en blanco porque dependen de rondas anteriores. Aun así debes llenar un marcador.", en: "Some teams appear blank because they depend on earlier rounds. You still need to enter a score." },
    ],
  },
  {
    id: "lock",
    icon: "🔒",
    title: { es: "Cierre del torneo", en: "Tournament deadline" },
    bullets: [
      { es: "El cierre coincide con el inicio del primer partido (o la fecha que fije el admin).", en: "The deadline matches the start of the first match (or a date set by the admin)." },
      { es: "Después del cierre no se puede crear, editar ni enviar ninguna quiniela.", en: "After the deadline, no quiniela can be created, edited, or submitted." },
      { es: "Los borradores sin enviar quedan bloqueados y no puntúan.", en: "Unsubmitted drafts remain locked and score no points." },
    ],
  },
  {
    id: "reopen",
    icon: "🔓",
    title: { es: "Reapertura de eliminatorias", en: "Knockout editing reopen" },
    bullets: [
      { es: "El admin puede reabrir la eliminatoria una vez iniciado el torneo.", en: "Your admin can reopen knockout editing after the tournament starts." },
      { es: "Solo los partidos no iniciados quedan editables.", en: "Only unstarted knockout matches are editable." },
      { es: "Los grupos y las preguntas bonus siguen bloqueados.", en: "Group stage and bonus questions remain locked." },
      { es: "Aplica solo mientras el admin mantenga la opción activa en tu liga.", en: "Available only while your admin has the option enabled for your league." },
    ],
  },
  {
    id: "prizes",
    icon: "💰",
    title: { es: "Premios de la liga", en: "League prizes" },
    bullets: [
      { es: "Ligas de dinero: el pozo = precio de entrada × quinielas enviadas.", en: "Money leagues: pool = entry price × submitted quinielas." },
      { es: "Ligas de premios físicos: el admin define 1°, 2° y 3° lugar.", en: "Physical prize leagues: the admin defines 1st, 2nd, and 3rd place prizes." },
      { es: "Antes de confirmar el envío verás el detalle de premios de tu liga.", en: "Before confirming submission you'll see your league's prize details." },
    ],
  },
  {
    id: "visibility",
    icon: "👁",
    title: { es: "Visibilidad y ranking", en: "Visibility & rankings" },
    bullets: [
      { es: "Borradores: solo tú los ves.", en: "Drafts: only you can see them." },
      { es: "Quinielas enviadas: visibles para todos los miembros de tu liga.", en: "Submitted quinielas: visible to all members of your league." },
      { es: "El ranking del Dashboard muestra solo las quinielas enviadas de tu liga.", en: "The Dashboard ranking shows only submitted quinielas from your league." },
      { es: "Desempate: más exactos → más aciertos → registro más antiguo.", en: "Tiebreaker: most exact → most correct → oldest registration." },
    ],
  },
]

interface FAQ { q: BiLang; a: BiLang }

const FAQS: FAQ[] = [
  {
    q: { es: "¿Puedo guardar y terminar después?", en: "Can I save and finish later?" },
    a: { es: "Sí. Guarda tu quiniela como borrador y vuelve cuando quieras antes del cierre del torneo.", en: "Yes. Save as a draft and return any time before the tournament deadline." },
  },
  {
    q: { es: "¿Puedo editar mi quiniela después de enviarla?", en: "Can I edit after submitting?" },
    a: { es: "Sí, hasta el cierre del torneo. Puedes modificar grupos, eliminatoria y bonus aunque ya hayas enviado. Una vez que llega el cierre, nada se puede cambiar.", en: "Yes, until the tournament deadline. You can modify groups, knockout picks, and bonus questions even after submitting. Once the deadline passes, nothing can be changed." },
  },
  {
    q: { es: "¿Por qué no puedo enviar mi quiniela?", en: "Why can't I submit my quiniela?" },
    a: { es: "Necesitas completar todo: todos los partidos de grupos, todos los slots de la eliminatoria (con ganador de penales si hay empate), y las dos preguntas bonus (goleador y equipo con más goles).", en: "You need to complete everything: all group matches, every knockout slot (including a penalty winner for any draw), and both bonus questions (top scorer and most goals team)." },
  },
  {
    q: { es: "¿Qué pasa si predigo empate en la eliminatoria?", en: "What happens if I predict a tie in the knockout stage?" },
    a: { es: "El sistema asume automáticamente que el partido va a penales. Solo selecciona el equipo que gana la tanda de penales en el campo que aparece.", en: "The system automatically assumes the match goes to penalties. Just select the penalty winner in the field that appears." },
  },
  {
    q: { es: "¿Por qué aparecen equipos en blanco en la fase eliminatoria?", en: "Why do some knockout teams appear blank?" },
    a: { es: "Los equipos de rondas avanzadas todavía dependen de los resultados de rondas anteriores. Aun así debes llenar un marcador.", en: "Teams in advanced rounds depend on earlier results. You still need to enter a score prediction." },
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
    a: { es: "Selecciona primero el equipo/país del jugador para filtrar la búsqueda. Si aun así no aparece, prueba con su apellido o una variante del nombre.", en: "First select the player's team/country to filter the search. If they still don't appear, try their last name or a name variant." },
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

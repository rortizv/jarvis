/**
 * Heurística: ¿la pregunta pide información enciclopédica y debemos consultar Wikipedia?
 */

const ENCYCLOPEDIC_PATTERNS = [
  /que\s+es\b/i,
  /que\s+son\b/i,
  /quien\s+es\b/i,
  /quien\s+fue\b/i,
  /informacion\s+sobre/i,
  /busca\s+/i,
  /buscar\s+/i,
  /hablame\s+de/i,
  /cuentame\s+de/i,
  /que\s+sabes\s+de/i,
  /wikipedia/i,
  /que\s+es\s+el\s+/i,
  /que\s+es\s+la\s+/i,
  /que\s+es\s+un\s+/i,
  /que\s+es\s+una\s+/i,
  /qué\s+es\s+/i,
  /qué\s+es\s+el\s+/i,
  /qué\s+es\s+la\s+/i,
  /qué\s+es\s+un\s+/i,
  /qué\s+es\s+una\s+/i,
  /qué\s+es\s+el\s+/i,
  /qué\s+es\s+la\s+/i,
  /qué\s+es\s+un\s+/i,
  /qué\s+es\s+una\s+/i,
  /cuantos\s+es\s+/i,
  /cuantas\s+es\s+/i,
  /cuantos\s+es\s+/i,
  /cuanto\s+es\s+/i,
  /cuánto\s+es\s+/i,
  /cuántas\s+es\s+/i,
  /cuántos\s+es\s+/i,
  /cuánto\s+es\s+/i,
  /cuántas\s+es\s+/i,
  /cuántos\s+es\s+/i,
  /cuánto\s+es\s+/i,
  /cuántas\s+es\s+/i,
  /cuántos\s+es\s+/i,
];

function normalize(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function needsWikipedia(question: string): boolean {
  const n = normalize(question);
  return ENCYCLOPEDIC_PATTERNS.some((re) => re.test(n));
}

export function getSearchQuery(question: string): string {
  const q = (question ?? '').trim();
  const n = normalize(q);
  const rest = n
    .replace(/^(que\s+es\s+(el\s+|la\s+|un\s+|una\s+)?)/i, '')
    .replace(/^(quien\s+(es|fue)\s+)/i, '')
    .replace(/^(informacion\s+sobre\s*|busca\s*|buscar\s*|hablame\s+de\s*|cuentame\s+de\s*|que\s+sabes\s+de\s*)/i, '')
    .replace(/\?+$/g, '')
    .trim();
  return rest || q;
}

/** Patrones que sugieren información que conviene buscar en la web: pasado (resultados, “quién ganó”) y futuro (próximo, cuándo es). */
const RECENT_INFO_PATTERNS = [
  /quien\s+gano/i,
  /quien\s+ganó/i,
  /quien\s+gana/i,
  /quien\s+habia\s+ganado/i,
  /quien\s+había\s+ganado/i,
  /ultimo\s+/i,
  /último\s+/i,
  /ultima\s+/i,
  /última\s+/i,
  /ultima\s+carrera/i,
  /última\s+carrera/i,
  /carrera\s+de\s+formula/i,
  /carrera\s+de\s+f1/i,
  /fin\s+de\s+semana/i,
  /semana\s+pasada/i,
  /resultado\s+/i,
  /resultados\s+/i,
  /noticias?\s+/i,
  /noticia\s+/i,
  /hoy\s+/i,
  /ayer\s+/i,
  /formula\s*1/i,
  /\bf1\b/i,
  /\bgp\b/i,
  /campeonato\s+/i,
  /liga\s+/i,
  /partido\s+/i,
  /final\s+de/i,
  /ganador\s+/i,
  /ganadores?\s+/i,
  /clasificacion\s+/i,
  /clasificación\s+/i,
  /cuando\s+fue\s+(la\s+)?/i,
  /cuándo\s+fue\s+(la\s+)?/i,
  /cuando\s+habia\s+sido/i,
  /cuándo\s+había\s+sido/i,
  /cuando\s+era/i,
  /cuándo\s+era/i,
  /esa\s+carrera/i,
  /ese\s+partido/i,
  /esa\s+final/i,
  // Referencias al pasado (anterior, pasado, la vez pasada…)
  /\banterior\b/i,
  /\banteriormente\b/i,
  /\bpasado\b/i,
  /\bpasada\b/i,
  /en\s+el\s+pasado/i,
  /la\s+vez\s+pasada/i,
  /la\s+vez\s+anterior/i,
  /el\s+otro\s+dia/i,
  /\banteayer\b/i,
  // Futuro (próximo, siguiente, cuándo es, fecha, horario…) — texto ya normalizado sin tildes
  /\bproximo\b/i,
  /\bproxima\b/i,
  /\bsiguiente\b/i,
  /\bfuturo\b/i,
  /cuando\s+es\s+(el\s+)?/i,
  /cuando\s+sera\b/i,
  /cuando\s+juega/i,
  /cuando\s+empieza/i,
  /fecha\s+del\s+/i,
  /fecha\s+de\s+la\s+/i,
  /que\s+dia\s+es\s+(el\s+)?/i,
  /horario\s+del\s+/i,
  /calendario\s+/i,
  /proximo\s+(gp|partido|carrera)/i,
  /siguiente\s+(gp|partido|carrera)/i,
];

export function needsRecentInfo(question: string): boolean {
  const n = normalize(question);
  return RECENT_INFO_PATTERNS.some((re) => re.test(n));
}

/** Query para búsqueda web: la pregunta tal cual suele dar buenos resultados. */
export function getWebSearchQuery(question: string): string {
  const q = (question ?? '').trim();
  return q.replace(/\?+$/g, '').trim() || q;
}

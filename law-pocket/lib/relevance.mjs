import { pickFields } from "./format.mjs";
import { isGarbageSearchQuery, relevanceTerms } from "./query.mjs";

const MILITARY_MARKERS =
  /군형법|상관모욕|군사법원|군사법|해군|육군|공군|해병|전역|군인|군형|장교|영창|군무이탈/;

const NOISE_MARKERS =
  /매트리스|라돈|특허|상표|권리범위확인|주거환경|산업안전보건기준에 관한 규칙|건설기계 안전|건축물의 구조/;

function resolveTerms(question, terms) {
  const t = (terms?.length ? terms : relevanceTerms(question)).filter(
    (x) => !isGarbageSearchQuery(x)
  );
  return t.length ? t : relevanceTerms(question);
}

function blobOf(item, extraText = "") {
  const { title, extra, _raw } = pickFields(item);
  return `${title}\n${extra}\n${extraText}\n${JSON.stringify(_raw ?? {})}`;
}

function termOverlapScore(terms, blob) {
  let score = 0;
  let hits = 0;
  for (const term of terms) {
    if (term.length < 2) continue;
    if (blob.includes(term)) {
      hits += 1;
      score += term.length >= 4 ? 16 : 9;
    }
  }
  return { score, hits };
}

function lawTitleHeuristics(title) {
  let score = 0;
  if (/시행규칙/.test(title)) score -= 40;
  else if (/시행령/.test(title)) score -= 20;
  if (/^[\w\s]+법$/.test(title.replace(/\s/g, "")) && !/시행/.test(title)) {
    score += 12;
  }
  return score;
}

export function scorePrecedent(question, item, briefText = "", terms = null) {
  const t = resolveTerms(question, terms);
  const blob = blobOf(item, briefText);
  const title = pickFields(item).title;
  const { score: overlap, hits } = termOverlapScore(t, blob);
  let score = overlap;

  if (title && t.some((term) => term.length >= 2 && title.includes(term))) {
    score += 26;
  }
  if (hits === 0 && overlap < 8) score -= 35;
  if (NOISE_MARKERS.test(blob) && hits < 2) score -= 90;
  if (MILITARY_MARKERS.test(blob) && !/군|군대|군형|상관/.test(question)) {
    score -= 85;
  }
  if (/판시사항|판결요지/.test(briefText)) score += 8;
  if (/대법원/.test(blob)) score += 3;
  return score;
}

export function scoreLawItem(question, item, terms = null) {
  const t = resolveTerms(question, terms);
  const title = pickFields(item).title;
  const { score: overlap, hits } = termOverlapScore(t, title);
  let score = overlap + lawTitleHeuristics(title);
  if (hits === 0) score -= 25;
  if (NOISE_MARKERS.test(title)) score -= 70;
  return score;
}

function minPrecedentScore(question, terms) {
  const t = resolveTerms(question, terms);
  const substantive = t.filter((x) => x.length >= 3).length;
  return Math.max(16, 8 + substantive * 3);
}

export function filterAndRankPrecedents(
  question,
  items,
  limit = 6,
  terms = null
) {
  const minScore = minPrecedentScore(question, terms);
  const ranked = items
    .map((it) => ({ it, score: scorePrecedent(question, it, "", terms) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0]?.score ?? 0;
  const cutoff = Math.max(minScore, top > 0 ? top * 0.52 : minScore);

  const kept = ranked.filter((x) => x.score >= cutoff).slice(0, limit);
  if (kept.length) return kept.map((x) => x.it);

  if (top >= minScore - 4 && ranked[0]) {
    return ranked.slice(0, 1).map((x) => x.it);
  }
  return [];
}

export function filterAndRankLaws(question, items, limit = 5, terms = null) {
  const minScore = 10;
  return items
    .map((it) => ({ it, score: scoreLawItem(question, it, terms) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.it);
}

export function filterNoteFor(question, beforeCount, afterCount) {
  if (afterCount >= beforeCount) return null;
  return "질문·검색 키워드와 맞지 않는 법령·판례를 제외했습니다.";
}

export function refinePrecedentsAfterBrief(
  question,
  precedents,
  limit = 4,
  terms = null
) {
  const minScore = minPrecedentScore(question, terms) - 2;
  const scored = precedents
    .map((p) => {
      const briefText = (p.brief?.sections ?? [])
        .map((s) => s.text)
        .join("\n");
      const item = p._item;
      const score = item
        ? scorePrecedent(question, item, briefText, terms)
        : 0;
      return { p, score };
    })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.p);
}

export function briefMatchesTerms(brief, terms) {
  const t = terms.filter((x) => x.length >= 2);
  const body = `${brief.title}\n${(brief.sections ?? []).map((s) => s.text).join("\n")}`;
  const { hits } = termOverlapScore(t, body.slice(0, 2000));
  return hits >= 1;
}

/** @deprecated use planSearch terms */
export function activeProfile() {
  return null;
}

export function searchQueriesForTopics(baseQueries) {
  return baseQueries;
}

export function searchQueriesForPrecedents(baseQueries) {
  return baseQueries;
}

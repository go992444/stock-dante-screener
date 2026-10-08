import { geminiModelsToTry } from "./gemini.mjs";
import {
  buildSearchQueries,
  isGarbageSearchQuery,
  relevanceTerms,
} from "./query.mjs";

function dedupe(list) {
  return [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
}

function cleanQueries(list, max = 8) {
  return dedupe(list)
    .filter((q) => q.length >= 2 && !isGarbageSearchQuery(q))
    .slice(0, max);
}

function rulePlan(question) {
  const { queries, keywords } = buildSearchQueries(question);
  const terms = relevanceTerms(question);
  const q = cleanQueries(queries, 10);
  return {
    lawQueries: q,
    precQueries: q,
    terms: cleanQueries(terms, 12),
    statutes: [],
    source: "rules",
  };
}

function parsePlannerJson(text) {
  const raw = String(text ?? "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function geminiPlanSearch(question) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  const models = geminiModelsToTry();
  const prompt = `당신은 한국 법령·판례 DB 검색 전문가입니다. 사용자 질문에 맞는 검색어만 JSON으로 답합니다.

출력 형식(다른 글 없이 JSON만):
{
  "law": ["법령명 검색어 2~5개"],
  "prec": ["판례 검색어 3~6개"],
  "terms": ["관련도 판단용 핵심어 5~12개"],
  "statutes": [{"law": "법령명", "articles": ["조번호 문자열"]}]
}

규칙:
- law에는 「○○법」 같은 법령 이름·법률 용어
- prec에는 사건 유형·법률 쟁점 키워드(예: 교통사고, 보행자, 과실)
- terms에는 질문 주제·행위·피해·관계를 담은 명사/합성어. 어미·조각(인가요, 때문에, 했습니다) 금지
- statutes는 확실할 때만(대표 조문 1~3개). 모르면 []
- 질문과 무관한 키워드 금지

질문:
${question}`;

  let lastErr = null;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 420,
            responseMimeType: "application/json",
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = data?.error?.message ?? res.status;
        continue;
      }
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .join("");
      const parsed = parsePlannerJson(text);
      if (!parsed) continue;
      return {
        law: cleanQueries(parsed.law ?? [], 6),
        prec: cleanQueries(parsed.prec ?? [], 8),
        terms: cleanQueries(parsed.terms ?? [], 14),
        statutes: Array.isArray(parsed.statutes) ? parsed.statutes.slice(0, 2) : [],
        model,
      };
    } catch (e) {
      lastErr = e?.message;
    }
  }
  return lastErr ? { error: lastErr } : null;
}

function normalizeStatuteSpecs(specs) {
  const out = [];
  for (const s of specs) {
    if (!s?.law || !Array.isArray(s.articles)) continue;
    const articles = s.articles
      .map((a) => {
        const m = String(a).match(/(\d+)(?:조의(\d+))?/);
        if (!m) return null;
        const art = Number.parseInt(m[1], 10);
        const branch = m[2] ? Number.parseInt(m[2], 10) : 0;
        if (!Number.isFinite(art)) return null;
        return branch ? { art, branch } : art;
      })
      .filter(Boolean);
    if (articles.length) out.push({ lawQuery: String(s.law).trim(), articles });
  }
  return out;
}

export async function planSearch(question) {
  const base = rulePlan(question);
  const ai = await geminiPlanSearch(question);

  if (!ai || ai.error) {
    return {
      ...base,
      plannerNote: ai?.error ? "AI 검색어 보강 실패, 규칙 기반만 사용" : null,
    };
  }

  const lawQueries = cleanQueries([...ai.law, ...base.lawQueries], 10);
  const precQueries = cleanQueries([...ai.prec, ...base.precQueries], 10);
  const terms = cleanQueries([...ai.terms, ...base.terms], 16);
  const statutes = normalizeStatuteSpecs(ai.statutes);

  return {
    lawQueries: lawQueries.length ? lawQueries : base.lawQueries,
    precQueries: precQueries.length ? precQueries : base.precQueries,
    terms: terms.length ? terms : base.terms,
    statutes,
    source: "universal",
    plannerModel: ai.model,
    plannerNote: null,
  };
}

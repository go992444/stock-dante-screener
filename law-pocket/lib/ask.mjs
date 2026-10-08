import { APP_VERSION, BUILD_LABEL } from "../version.js";
import { detailBundle, search } from "./client.mjs";
import {
  itemsFromSearch,
  LAW_API_IP_HINT,
  lawApiErrorFromPayload,
  pickFields,
} from "./format.mjs";
import { explainWithGemini } from "./gemini.mjs";
import {
  briefMatchesTerms,
  filterAndRankLaws,
  filterAndRankPrecedents,
  filterNoteFor,
  refinePrecedentsAfterBrief,
} from "./relevance.mjs";
import {
  formatArticleLabel,
  formatJoParam,
  statutePlans,
} from "./query.mjs";
import { planSearch } from "./searchPlan.mjs";
import {
  briefLawArticles,
  briefPrec,
  pickMainLaw,
  precDetailIds,
} from "./summarize.mjs";

const MAX_SEARCH_ROUNDS = 5;
const MERGE_CAP = 28;

async function collectSearchHits(target, queries, display = 8) {
  const merged = new Map();
  const tried = [];
  let lastData = null;
  let apiError = null;

  for (const query of queries.slice(0, MAX_SEARCH_ROUNDS)) {
    tried.push(query);
    try {
      const data = await search({ target, query, display });
      lastData = data;
      if (lawApiErrorFromPayload(data)) {
        apiError = data;
        break;
      }
      for (const item of itemsFromSearch(data)) {
        const key = pickFields(item).id || pickFields(item).title;
        if (!key || merged.has(key)) continue;
        merged.set(key, item);
      }
      if (merged.size >= MERGE_CAP) break;
    } catch {
      /* next query */
    }
  }

  return {
    items: [...merged.values()],
    queriesTried: tried,
    lastData,
    apiError,
  };
}

async function loadStatutes(question, lawItems, plan) {
  const statutes = [];
  const fromPlanner = (plan.statutes ?? []).slice(0, 2);
  const fromRules = statutePlans(question).slice(0, 3);
  const plans = [...fromPlanner, ...fromRules].slice(0, 4);
  const mainFromSearch = pickMainLaw(lawItems);
  const mstFromList = mainFromSearch ? pickFields(mainFromSearch).id : "";

  for (const planItem of plans) {
    let mst = "";
    const lawName = planItem.lawQuery;
    if (mstFromList && pickFields(mainFromSearch).title.includes(lawName)) {
      mst = mstFromList;
    }
    if (!mst) {
      try {
        const data = await search({ target: "law", query: lawName, display: 8 });
        const items = filterAndRankLaws(
          question,
          itemsFromSearch(data),
          5,
          plan.terms
        );
        const main =
          items.find((i) => (pickFields(i).title ?? "").includes(lawName)) ??
          items[0];
        mst = main ? pickFields(main).id : "";
      } catch {
        continue;
      }
    }
    if (!mst) continue;

    const articles = planItem.articles.slice(0, 3);
    await Promise.all(
      articles.map(async (art) => {
        const jo = formatJoParam(art);
        if (!jo) return;
        try {
          const { json, xml } = await detailBundle({
            target: "law",
            id: mst,
            jo,
          });
          const brief = briefLawArticles(json, xml);
          const hasBody = brief.sections.some((s) => s.text.length > 30);
          if (hasBody) {
            statutes.push({
              lawId: mst,
              lawName,
              article: art,
              articleLabel: formatArticleLabel(art),
              title:
                brief.title && brief.title !== "법령" ? brief.title : lawName,
              sections: brief.sections,
            });
          }
        } catch {
          /* skip */
        }
      })
    );
    if (statutes.length) break;
  }
  return statutes;
}

export async function runAsk(question) {
  const plan = await planSearch(question);
  const terms = plan.terms;

  const out = {
    appVersion: APP_VERSION,
    buildLabel: BUILD_LABEL,
    disclaimer:
      "법률 자문이 아닙니다. 국가법령정보 참고용입니다. 중요한 결정은 전문가와 상담하세요.",
    question,
    keywords: terms.slice(0, 8),
    relevanceTerms: terms.slice(0, 8),
    searchPlanSource: plan.source,
    plannerModel: plan.plannerModel ?? null,
    plannerNote: plan.plannerNote,
    queriesTried: plan.lawQueries.slice(0, 4),
    precQueriesTried: plan.precQueries.slice(0, 4),
    filterNote: null,
    law: null,
    precedents: [],
    statutes: [],
    interpretations: [],
    explanation: null,
  };

  const [lawPool, precPool] = await Promise.all([
    collectSearchHits("law", plan.lawQueries, 8),
    collectSearchHits("prec", plan.precQueries, 10),
  ]);

  const apiErr =
    lawApiErrorFromPayload(lawPool.apiError) ||
    lawApiErrorFromPayload(precPool.apiError) ||
    lawApiErrorFromPayload(lawPool.lastData) ||
    lawApiErrorFromPayload(precPool.lastData);

  if (apiErr) {
    out.hint = LAW_API_IP_HINT;
    return out;
  }

  const lawItems = filterAndRankLaws(
    question,
    lawPool.items,
    5,
    terms
  );
  const precRaw = precPool.items;
  const precItems = filterAndRankPrecedents(
    question,
    precRaw,
    6,
    terms
  );
  out.filterNote = filterNoteFor(question, precRaw.length, precItems.length);

  out.law = {
    searchQuery: lawPool.queriesTried[0] ?? plan.lawQueries[0],
    items: lawItems
      .map((i) => pickFields(i))
      .filter((x) => x.title !== "(제목 없음)" && /[가-힣]/.test(x.title)),
  };

  for (const item of precItems) {
    const list = pickFields(item);
    if (list.title === "(제목 없음)" || !/[가-힣]/.test(list.title)) continue;
    out.precedents.push({ list, brief: null, _item: item });
  }

  await Promise.all(
    out.precedents.slice(0, 3).map(async (row, idx) => {
      const item = row._item;
      if (!item) return;
      const ids = precDetailIds(pickFields(item));
      for (const id of ids.slice(0, 2)) {
        try {
          const { json, xml } = await detailBundle({ target: "prec", id });
          const brief = briefPrec(json, xml);
          if (!brief.sections.length) continue;
          const onlyDocket =
            brief.sections.length === 1 &&
            brief.sections[0].title === "판례내용(일부)";
          if (onlyDocket && !briefMatchesTerms(brief, terms)) continue;
          out.precedents[idx].brief = { id, ...brief };
          break;
        } catch {
          /* next */
        }
      }
    })
  );

  const refined = refinePrecedentsAfterBrief(
    question,
    out.precedents,
    4,
    terms
  );
  if (refined.length < out.precedents.length && !out.filterNote) {
    out.filterNote = "판시·요지를 확인해 질문과 맞는 판례만 남겼습니다.";
  }
  out.precedents = refined.map(({ list, brief }) => ({ list, brief }));

  out.statutes = await loadStatutes(question, lawItems, plan);

  const hasAny =
    out.law.items.length > 0 ||
    out.precedents.length > 0 ||
    out.statutes.length > 0;

  if (!hasAny) {
    out.hint =
      "관련 자료를 찾지 못했습니다. 질문을 한 줄로 줄이거나 핵심 법률 용어를 넣어 다시 검색해 보세요.";
  } else if (
    !out.statutes.length &&
    !out.precedents.some((p) => p.brief?.sections?.length) &&
    out.law.items.length
  ) {
    out.filterNote =
      (out.filterNote ? `${out.filterNote} ` : "") +
      "조문·판례 요약이 없어 법령 목록만 표시했습니다.";
  }

  if (hasAny) {
    out.explanation = await explainWithGemini(out);
  } else {
    out.explanation = {
      status: "skipped",
      text: null,
      reason: "검색 결과가 없어 AI 설명을 생략했습니다.",
    };
  }

  return out;
}

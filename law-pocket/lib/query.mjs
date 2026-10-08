const STOP = new Set([
  "어떻게", "해야", "하나요", "인가요", "해요", "합니다", "했는데", "한다고", "준다고",
  "안", "못", "받았다", "받아서", "있어", "없어", "힘들어", "정신적으로", "정신적",
  "안준대요", "안준대", "준대요", "해요", "있어요", "섞인",
  "회사에서", "상사에게", "저는", "제가", "나는", "내가", "그런데", "근데", "있는데",
  "아닌데", "인데", "하면", "해서", "되는", "되는데", "갑자기", "인한", "시야", "옆차",
]);

/** 문장에 포함되면 우선 검색할 법령·키워드 */
const TOPIC_HINTS = [
  {
    re: /운전|교통|보행|사각|사고|차량|도로|횡단|신호|추돌|음주|무면허|과실/,
    terms: ["도로교통법", "교통사고", "보행자", "운전자 과실", "사각지대"],
  },
  { re: /연차|퇴직|퇴사/, terms: ["연차수당", "유급휴가", "근로기준법"] },
  { re: /임금|체불|급여/, terms: ["임금체불", "근로기준법"] },
  { re: /부당해고|해고/, terms: ["부당해고", "근로기준법"] },
  {
    re: /조롱|모욕|욕설|괴롭|왕따|따돌림|직장|상사|괴롭힘|성희롱|농담/,
    terms: ["직장내괴롭힘", "근로기준법"],
  },
  { re: /명예|허위|비방/, terms: ["명예훼손", "모욕", "형법"] },
  { re: /성희롱|성추행/, terms: ["성희롱", "남녀고용평등", "근로기준법"] },
  { re: /군|군대|군형|상관모욕/, terms: ["군형법", "상관모욕"] },
];

/** 부분 문자열로 뽑을 핵심어 (길이 긴 것부터) */
const PHRASE_IN_TEXT = [
  "직장내괴롭힘",
  "사각지대",
  "교통사고",
  "성희롱",
  "연차수당",
  "부당해고",
  "명예훼손",
  "유급휴가",
  "보행자",
  "도로교통법",
  "괴롭힘",
  "조롱",
  "모욕",
  "욕설",
  "왕따",
  "퇴직금",
  "임금",
];

export function isGarbageSearchQuery(q) {
  const s = String(q).trim();
  if (s.length < 2) return true;
  if (/인가요|습니까|할까요|될까요/.test(s)) return true;
  if (/때문에?$|보이던$|나와서$|났습니다$|안보이|튀어나|과실인가/.test(s)) return true;
  if (/^제$/.test(s)) return true;
  return false;
}

function normalizeQuestionText(question) {
  return String(question)
    .replace(/사각지대때문에/g, "사각지대 때문에")
    .replace(/안보이던/g, "안 보이던")
    .replace(/튀어나와서/g, "튀어나와서 ")
    .replace(/과실인가요/g, "과실")
    .replace(/[?？!！.。\n]/g, " ")
    .trim();
}

function stripTail(word) {
  return word
    .replace(
      /(했는데|한다고|준다고|받았다|받아서|했어요|합니다|해요|힘들어|있어요|없어요|났습니다)$/g,
      ""
    )
    .replace(/(에서|에게|으로|부터|까지|처럼|보다|라고|중에)$/g, "")
    .replace(/[을를이가은는와과도만의에로]$/, "");
}

function isWeakToken(w) {
  if (w.length < 3) return true;
  if (STOP.has(w)) return true;
  if (/^(회사|상사|직장|사람|때문|보행자가|사고가)$/.test(w)) return true;
  if (/에서$|에게$/.test(w)) return true;
  if (/하고$|한다$|대요$|근무하고$|올해$/.test(w)) return true;
  if (isGarbageSearchQuery(w)) return true;
  return false;
}

function defaultQueriesFor(text) {
  if (/운전|교통|보행|사각|사고/.test(text)) {
    return ["도로교통법", "교통사고", "보행자"];
  }
  return ["근로기준법"];
}

export function buildSearchQueries(question) {
  const text = normalizeQuestionText(question);
  const queries = [];

  for (const phrase of PHRASE_IN_TEXT) {
    if (text.includes(phrase)) queries.push(phrase);
  }

  for (const { re, terms } of TOPIC_HINTS) {
    if (re.test(text)) queries.push(...terms);
  }

  const tokens = text
    .split(/\s+/)
    .map(stripTail)
    .filter((w) => !isWeakToken(w));
  const uniqueKw = [...new Set(tokens)];
  for (const k of uniqueKw.sort((a, b) => b.length - a.length)) {
    queries.push(k);
  }

  const unique = [
    ...new Set(
      queries
        .map((q) => q.trim())
        .filter((q) => q.length >= 2 && !isGarbageSearchQuery(q))
    ),
  ];
  const finalQueries = unique.length ? unique : defaultQueriesFor(text);
  return { queries: finalQueries.slice(0, 12), keywords: uniqueKw };
}

/** 법령명 검색 후 가져올 조문 */
export function statutePlans(question) {
  const text = String(question);
  const plans = [];
  if (/운전|교통|보행|사각|사고|차량|도로|횡단/.test(text)) {
    plans.push({ lawQuery: "도로교통법", articles: [17, 48, 49] });
  }
  if (/연차|퇴직|퇴사|연차수당/.test(text)) {
    plans.push({ lawQuery: "근로기준법", articles: [60, 61, 62] });
  }
  if (/조롱|괴롭|모욕|욕설|직장|상사|왕따|따돌림|성희롱|악의/.test(text)) {
    plans.push({
      lawQuery: "근로기준법",
      articles: [
        { art: 76, branch: 2 },
        { art: 76, branch: 3 },
      ],
    });
  }
  if (/부당해고|해고/.test(text)) {
    plans.push({ lawQuery: "근로기준법", articles: [23, 24] });
  }
  if (/임금|체불|급여/.test(text) && !/연차|퇴직/.test(text)) {
    plans.push({ lawQuery: "근로기준법", articles: [43, 44] });
  }
  if (/명예|비방|허위|모욕|욕설/.test(text) && !/직장|상사|괴롭/.test(text)) {
    plans.push({ lawQuery: "형법", articles: [307, 311] });
  }
  if (/성희롱|성추행/.test(text)) {
    plans.push({
      lawQuery: "남녀고용평등과 일·가정 양립 지원에 관한 법률",
      articles: [12, 13],
    });
  }
  return plans;
}

/** 관련도 점수용 검색어 */
export function relevanceTerms(question) {
  const { keywords, queries } = buildSearchQueries(question);
  const text = normalizeQuestionText(question);
  const fromText = PHRASE_IN_TEXT.filter((p) => text.includes(p));
  const goodQueries = queries.filter((q) => !isGarbageSearchQuery(q));
  return [
    ...new Set(
      [...fromText, ...goodQueries.slice(0, 8), ...keywords].filter(
        (t) => typeof t === "string" && t.length >= 2 && !isGarbageSearchQuery(t)
      )
    ),
  ];
}

export function formatArticleLabel(artOrSpec) {
  if (artOrSpec && typeof artOrSpec === "object") {
    const br = artOrSpec.branch ?? 0;
    return br ? `${artOrSpec.art}조의${br}` : `${artOrSpec.art}조`;
  }
  return `${artOrSpec}조`;
}

export function formatJoParam(artOrSpec, branch = 0) {
  let art = artOrSpec;
  let br = branch;
  if (artOrSpec && typeof artOrSpec === "object") {
    art = artOrSpec.art;
    br = artOrSpec.branch ?? 0;
  }
  const n = Number.parseInt(String(art), 10);
  const b = Number.parseInt(String(br), 10) || 0;
  if (!Number.isFinite(n) || n < 1) return null;
  return String(n * 100 + b).padStart(6, "0");
}

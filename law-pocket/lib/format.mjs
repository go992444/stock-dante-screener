export const LAW_API_IP_HINT =
  "법제처(open.law.go.kr)에서 이 사이트 도메인·서버 IP를 OC에 등록해야 합니다. Vercel은 해외 서버라 IP 등록이 어려울 수 있습니다.";

export function lawApiErrorFromPayload(data) {
  if (!data) return null;
  const text = JSON.stringify(data);
  if (
    text.includes("IP주소") &&
    (text.includes("도메인") || text.includes("OPEN API"))
  ) {
    return LAW_API_IP_HINT;
  }
  return null;
}

function isErrorLikeRow(row) {
  if (!row || typeof row !== "object") return false;
  const blob = JSON.stringify(row);
  return blob.includes("IP주소") && blob.includes("OPEN API");
}

function looksLikeRecord(row) {
  if (!row || typeof row !== "object") return false;
  return !!(
    row.법령명한글 ||
    row.법령명_한글 ||
    row.법령명 ||
    row.판례명 ||
    row.사건명 ||
    row.안건명 ||
    row.판례일련번호 ||
    row.법령일련번호 ||
    row.MST ||
    (row.ID && row.사건번호)
  );
}

function normalizeList(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.filter(looksLikeRecord);
  if (typeof node === "object" && looksLikeRecord(node)) return [node];
  return [];
}

export function normalizeSearchItem(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.data && typeof raw.data === "object") return raw.data;
  if (raw.item && typeof raw.item === "object") return raw.item;
  if (raw.attributes && typeof raw.attributes === "object") {
    return { ...raw.attributes, id: raw.id ?? raw.attributes.id };
  }
  return raw;
}

const RESULT_ARRAY_KEYS = [
  "law",
  "prec",
  "expc",
  "detc",
  "admrul",
  "ordin",
  "자치법규",
  "행정규칙",
];

export function itemsFromSearch(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.items)) {
    return data.items.map(normalizeSearchItem).filter(looksLikeRecord);
  }
  if (Array.isArray(data.results)) {
    return data.results.map(normalizeSearchItem).filter(looksLikeRecord);
  }

  for (const root of [data.LawSearch, data.PrecSearch, data.ExpcSearch, data]) {
    if (!root || typeof root !== "object") continue;
    for (const key of RESULT_ARRAY_KEYS) {
      if (!(key in root)) continue;
      const list = normalizeList(root[key]).map(normalizeSearchItem);
      const valid = list.filter((it) => looksLikeRecord(it) && !isErrorLikeRow(it));
      if (valid.length) return valid;
    }
  }
  return [];
}

function guessTitle(item) {
  const direct = [
    item.법령명한글,
    item.법령명_한글,
    item.법령명,
    item.판례명,
    item.사건명,
    item.안건명,
    item.행정규칙명,
    item.title,
    item.name,
    item.law_name,
    item.case_name,
    item.prec_name,
  ].find((v) => typeof v === "string" && v.trim().length > 0);
  if (direct) return direct.trim();

  for (const [k, v] of Object.entries(item)) {
    if (typeof v !== "string" || v.length < 2 || v.length > 300) continue;
    if (!/[가-힣]/.test(v)) continue;
    if (/명|title|name|subject/i.test(k)) return v.trim();
  }
  return "";
}

function guessId(item) {
  const direct = [
    item.법령일련번호,
    item.법령ID,
    item.판례일련번호,
    item.판례정보일련번호,
    item.일련번호,
    item.MST,
    item.ID,
    item.id,
    item.mst,
  ].find((v) => v != null && String(v).trim() !== "");
  if (direct != null) return String(direct).trim();

  for (const [k, v] of Object.entries(item)) {
    if (!/일련|ID|MST|id|번호/i.test(k)) continue;
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function pickFields(item) {
  const row = normalizeSearchItem(item);
  const title = guessTitle(row) || "(제목 없음)";
  const id = guessId(row);
  const extra = [];
  if (row.선고일자) extra.push(`선고 ${row.선고일자}`);
  if (row.사건번호) extra.push(row.사건번호);
  if (row.법원명) extra.push(row.법원명);
  if (row.시행일자) extra.push(`시행 ${row.시행일자}`);
  return { title, id, extra: extra.join(" · "), _raw: row };
}

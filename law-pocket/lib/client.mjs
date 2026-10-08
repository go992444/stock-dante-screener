import {
  itemsFromSearch,
  lawApiErrorFromPayload,
  pickFields,
} from "./format.mjs";

const LAW_HOST = "https://www.law.go.kr";
const PROXY_BASE =
  process.env.KSKILL_PROXY_BASE_URL?.replace(/\/$/, "") ||
  "https://k-skill-proxy.nomadamas.org";

const LAW_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; LawPocket/1.1; +https://open.law.go.kr)",
  Referer: "https://www.law.go.kr/",
};

function buildQuery(params) {
  return new URLSearchParams(params).toString();
}

async function fetchText(url, { timeoutMs = 18_000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: LAW_HEADERS });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("law_api_not_json");
  }
}

function oc() {
  const v = process.env.LAW_OC?.trim();
  if (!v) throw new Error("LAW_OC not configured on server");
  return v;
}

function idKeyForTarget(target) {
  return target === "law" || target === "eflaw" ? "MST" : "ID";
}

function lawServiceUrl(target, id, { type, jo }) {
  const idKey = idKeyForTarget(target);
  const params = { OC: oc(), target, type, [idKey]: id };
  if (jo) params.JO = jo;
  return `${LAW_HOST}/DRF/lawService.do?${buildQuery(params)}`;
}

async function searchDirect({ target, query, page, display, bodySearch }) {
  const params = {
    OC: oc(),
    target,
    type: "JSON",
    query,
    page,
    display,
  };
  if (bodySearch) params.search = "2";
  const url = `${LAW_HOST}/DRF/lawSearch.do?${buildQuery(params)}`;
  return fetchJson(url);
}

async function searchProxy({ target, query, page, display }) {
  const url = `${PROXY_BASE}/v1/korean-law/search?${buildQuery({
    target,
    query,
    page: String(page),
    display: String(display),
  })}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
  return JSON.parse(text);
}

export async function search({
  target,
  query,
  page = 1,
  display = 10,
  bodySearch = false,
}) {
  let data;
  try {
    data = await searchDirect({ target, query, page, display, bodySearch });
    const apiErr = lawApiErrorFromPayload(data);
    if (apiErr) throw new Error("LAW_API_IP_VERIFY");
    let directItems = itemsFromSearch(data);
    if (directItems.length > 0) return data;

    if (!bodySearch) {
      const bodyData = await searchDirect({
        target,
        query,
        page,
        display,
        bodySearch: true,
      });
      const bodyErr = lawApiErrorFromPayload(bodyData);
      if (!bodyErr && itemsFromSearch(bodyData).length > 0) return bodyData;
    }
  } catch {
    data = null;
  }

  if (process.env.LAW_PROXY_FALLBACK === "1") {
    try {
      const proxied = await searchProxy({ target, query, page, display });
      if (itemsFromSearch(proxied).length > 0) return proxied;
    } catch {
      /* ignore */
    }
  }

  return data ?? {};
}

export async function detailBundle({ target, id, jo }) {
  const json = await fetchJson(lawServiceUrl(target, id, { type: "JSON", jo }));
  let xml = null;
  if (target === "prec" || target === "expc" || target === "law") {
    try {
      xml = await fetchText(lawServiceUrl(target, id, { type: "XML", jo }));
    } catch {
      xml = null;
    }
  }
  return { json, xml };
}

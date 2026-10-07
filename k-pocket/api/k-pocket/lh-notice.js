/**
 * LH (data.go.kr B552555)
 * - 목록: 임대주택단지 lhLeaseInfo1 (「서울 LH 청약」 등)
 * - 상세 공급: 분양임대공고별 공급정보 getLeaseNoticeSplInfo1 (PAN_ID 필요)
 */

const LEASE_COMPLEX_URL =
  "https://apis.data.go.kr/B552555/lhLeaseInfo1/lhLeaseInfo1";
const SUPPLY_URL =
  "https://apis.data.go.kr/B552555/lhLeaseNoticeSplInfo1/getLeaseNoticeSplInfo1";

const REGION_CNP = {
  서울: "11",
  서울특별시: "11",
  부산: "26",
  부산광역시: "26",
  대구: "27",
  인천: "28",
  광주: "29",
  대전: "30",
  울산: "31",
  세종: "36",
  경기: "41",
  강원: "42",
  충북: "43",
  충남: "44",
  전북: "45",
  전남: "46",
  경북: "47",
  경남: "48",
  제주: "50",
};

function serviceKey() {
  const key = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!key) {
    const err = new Error(
      "공공데이터포털 인증키(DATA_GO_KR_API_KEY)가 Vercel 환경 변수에 없습니다."
    );
    err.status = 500;
    throw err;
  }
  return key;
}

function resolveCnpCd(query) {
  if (query.cnpCd) return String(query.cnpCd).trim();
  const name = (query.cnpCdNm || "").trim();
  if (!name) return "11";
  for (const [k, v] of Object.entries(REGION_CNP)) {
    if (name.includes(k)) return v;
  }
  return "11";
}

async function fetchDataGoKr(baseUrl, params) {
  const key = serviceKey();
  const build = (encodeKey) => {
    const u = new URL(baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") u.searchParams.set(k, String(v));
    }
    u.searchParams.set(
      "ServiceKey",
      encodeKey ? encodeURIComponent(key) : key
    );
    return u.toString();
  };

  let res = await fetch(build(false));
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    res = await fetch(build(true));
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg ||
      data?.message ||
      `LH API HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = 502;
    err.upstreamStatus = res.status;
    throw err;
  }
  return data;
}

function unwrapItems(data) {
  if (Array.isArray(data?.items)) return data.items;
  const stacks = [
    data?.response?.body?.items,
    data?.lhLeaseInfo1,
    data?.getLeaseNoticeSplInfo1,
    data?.body?.items,
    data?.dsList,
    data?.list,
  ];
  for (const s of stacks) {
    if (Array.isArray(s)) return s;
    if (s && typeof s === "object" && !Array.isArray(s)) {
      const vals = Object.values(s).filter((x) => x && typeof x === "object");
      if (vals.length) return vals;
    }
  }
  if (data && typeof data === "object" && data.SS_CODE) return [data];
  return [];
}

async function listLeaseComplexes(query) {
  const cnpCd = resolveCnpCd(query);
  const pageSize = query.pageSize || query.PG_SZ || "10";
  const page = query.page || query.PAGE || "1";
  const data = await fetchDataGoKr(LEASE_COMPLEX_URL, {
    PG_SZ: pageSize,
    PAGE: page,
    CNP_CD: cnpCd,
    _type: "json",
  });
  const items = unwrapItems(data);
  return {
    mode: "lease_complex",
    api: "lhLeaseInfo1",
    cnpCd,
    items,
    raw: items.length ? undefined : data,
  };
}

async function getSupplyInfo(query) {
  const panId = (query.panId || query.PAN_ID || query.pan_id || "").trim();
  if (!panId) {
    const err = new Error(
      "공급정보 API는 공고번호(PAN_ID)가 필요합니다. 예: LH 2016122300001530"
    );
    err.status = 400;
    throw err;
  }
  const data = await fetchDataGoKr(SUPPLY_URL, {
    SPL_INF_TP_CD: query.splInfTpCd || query.SPL_INF_TP_CD || "010",
    CCR_CNNT_SYS_DS_CD:
      query.ccrCnntSysDsCd || query.CCR_CNNT_SYS_DS_CD || "01",
    PAN_ID: panId,
    UPP_AIS_TP_CD: query.uppAisTpCd || query.UPP_AIS_TP_CD || "06",
    AIS_TP_CD: query.aisTpCd || query.AIS_TP_CD || "",
    _type: "json",
  });
  const items = unwrapItems(data);
  return {
    mode: "supply",
    api: "getLeaseNoticeSplInfo1",
    panId,
    items,
    raw: items.length ? undefined : data,
  };
}

module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const panId = (q.panId || q.PAN_ID || q.pan_id || "").trim();
    const body = panId ? await getSupplyInfo(q) : await listLeaseComplexes(q);
    res.status(200).json(body);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({
      error: status === 502 ? "upstream_http" : "request_error",
      message: e.message || String(e),
      upstreamStatus: e.upstreamStatus,
    });
  }
};

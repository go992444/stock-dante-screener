/** @type {string} Same-origin proxy (vercel.json → k-skill-proxy) */
const API_BASE = "/api";

const tools = [
  {
    id: "weather",
    tab: "날씨",
    title: "한국 날씨",
    skill: "korea-weather",
    fields: [
      { name: "lat", label: "위도", placeholder: "37.5665", default: "37.5665" },
      { name: "lon", label: "경도", placeholder: "126.9780", default: "126.9780" },
    ],
    path: "/v1/korea-weather/forecast",
    geo: true,
  },
  {
    id: "subway",
    tab: "지하철",
    title: "서울 지하철 도착",
    skill: "seoul-subway-arrival",
    fields: [{ name: "stationName", label: "역 이름", placeholder: "강남" }],
    path: "/v1/seoul-subway/arrival",
  },
  {
    id: "density",
    tab: "혼잡도",
    title: "서울 실시간 혼잡도",
    skill: "seoul-density",
    fields: [
      {
        name: "area",
        label: "핫스팟 이름",
        placeholder: "강남역",
        default: "강남역",
      },
    ],
    path: "/v1/seoul-density/citydata",
  },
  {
    id: "real-estate",
    tab: "실거래",
    title: "부동산 실거래가",
    skill: "real-estate-search",
    disclaimer: "신고 기반 실거래·전월세입니다. 호가·시세가 아닙니다.",
    fields: [
      {
        name: "kind",
        label: "조회 (region_code / apartment_trade / apartment_rent / officetel_trade / villa_trade / single-house_trade / commercial_trade)",
        default: "apartment_trade",
      },
      {
        name: "q",
        label: "지역 검색어 (kind=region_code)",
        placeholder: "마포구",
      },
      {
        name: "lawd_cd",
        label: "법정동코드 5자리 (거래 조회)",
        placeholder: "11440",
      },
      {
        name: "deal_ymd",
        label: "계약월 YYYYMM",
        placeholder: "202403",
      },
    ],
    path: null,
    async run(params) {
      const kind = (params.kind || "apartment_trade").trim();
      if (kind === "region_code") {
        if (!params.q) throw new Error("지역 검색어(q)를 입력하세요.");
        return apiGet(
          `/v1/real-estate/region-code?${new URLSearchParams({ q: params.q })}`
        );
      }
      const lawd = params.lawd_cd?.trim();
      const deal = params.deal_ymd?.replace(/-/g, "");
      if (!lawd || !deal) {
        throw new Error("거래 조회는 lawd_cd와 deal_ymd(YYYYMM)가 필요합니다.");
      }
      const pathByKind = {
        apartment_trade: "/v1/real-estate/apartment/trade",
        apartment_rent: "/v1/real-estate/apartment/rent",
        officetel_trade: "/v1/real-estate/officetel/trade",
        villa_trade: "/v1/real-estate/villa/trade",
        "single-house_trade": "/v1/real-estate/single-house/trade",
        commercial_trade: "/v1/real-estate/commercial/trade",
      };
      const path = pathByKind[kind];
      if (!path) throw new Error(`지원하지 않는 kind: ${kind}`);
      const q = new URLSearchParams({ lawd_cd: lawd, deal_ymd: deal });
      return apiGet(`${path}?${q}`);
    },
  },
  {
    id: "law",
    tab: "법령",
    title: "법령·판례 검색",
    skill: "korean-law-search",
    disclaimer: "참고용입니다. 법률 자문이 아닙니다.",
    fields: [
      {
        name: "lawMode",
        label: "모드 (search / detail)",
        default: "search",
      },
      {
        name: "target",
        label: "target (law·prec·expc·ordin 등)",
        default: "law",
      },
      { name: "query", label: "검색어 (search)", placeholder: "관세법" },
      { name: "ID", label: "일련번호 (detail)", placeholder: "판례 ID" },
      { name: "JO", label: "조문 JO (detail, 선택)", placeholder: "000200" },
    ],
    path: null,
    async run(params) {
      const mode = (params.lawMode || "search").trim();
      const target = (params.target || "law").trim();
      if (mode === "detail") {
        if (!params.ID) throw new Error("detail 모드는 ID가 필요합니다.");
        const q = new URLSearchParams({ target, ID: params.ID });
        if (params.JO) q.set("JO", params.JO);
        return apiGet(`/v1/korean-law/detail?${q}`);
      }
      if (!params.query) throw new Error("search 모드는 query가 필요합니다.");
      const q = new URLSearchParams({ target, query: params.query });
      return apiGet(`/v1/korean-law/search?${q}`);
    },
  },
  {
    id: "building",
    tab: "건축물",
    title: "건축물대장 표제부",
    skill: "building-register-search",
    disclaimer: "등기 권리관계(소유·근저당)는 포함되지 않습니다.",
    fields: [
      {
        name: "pnu",
        label: "PNU 19자리 (우선)",
        placeholder: "1168010100101230004",
      },
      {
        name: "address",
        label: "주소 (PNU 없을 때, 지오코딩 후 조회)",
        placeholder: "서울 강남구 역삼동 123-4",
      },
    ],
    path: null,
    async run(params) {
      const pnu = params.pnu?.replace(/\s/g, "");
      if (pnu) {
        if (!/^\d{19}$/.test(pnu)) throw new Error("PNU는 19자리 숫자입니다.");
        return apiGet(
          `/v1/building-register/title?${new URLSearchParams({ pnu })}`
        );
      }
      if (!params.address) throw new Error("PNU 또는 주소를 입력하세요.");
      return buildingTitleFromAddress(params.address);
    },
  },
  {
    id: "housing-price",
    tab: "공시가",
    title: "공동주택 공시가격 (VWorld)",
    skill: "housing-official-price",
    disclaimer:
      "정부 공시가격입니다. 시세·실거래가가 아닙니다. VWorld API 키(BYOK)가 필요합니다.",
    fields: [
      {
        name: "vworldKey",
        label: "VWorld API 키 (x-k-skill-vworld-api-key)",
        placeholder: "vworld.kr 발급 키",
      },
      {
        name: "priceMode",
        label: "모드 (search / prices)",
        default: "prices",
      },
      {
        name: "query",
        label: "단지·지번 검색어 (search)",
        placeholder: "래미안",
      },
      {
        name: "type",
        label: "search type (place / address)",
        default: "place",
      },
      {
        name: "pnu",
        label: "PNU 19자리 (prices)",
        placeholder: "1168010100101230004",
      },
      {
        name: "stdrYear",
        label: "기준연도 YYYY (prices)",
        placeholder: "2025",
      },
      { name: "dongNm", label: "동 (prices, 선택)", placeholder: "101" },
      { name: "hoNm", label: "호 (prices, 선택)", placeholder: "1001" },
    ],
    path: null,
    async run(params) {
      const headers = vworldHeaders(params);
      const mode = (params.priceMode || "prices").trim();
      if (mode === "search") {
        if (!params.query) throw new Error("search 모드는 query가 필요합니다.");
        const q = new URLSearchParams({
          query: params.query,
          type: params.type || "place",
        });
        if (params.category) q.set("category", params.category);
        return apiGet(`/v1/vworld/search?${q}`, headers);
      }
      const pnu = params.pnu?.replace(/\s/g, "");
      const year = params.stdrYear?.trim();
      if (!pnu || !year) {
        throw new Error("prices 모드는 pnu(19자리)와 stdrYear가 필요합니다.");
      }
      const q = new URLSearchParams({ pnu, stdrYear: year });
      const dong = params.dongNm?.trim();
      const ho = params.hoNm?.trim();
      if (dong && ho) {
        q.set("dongNm", dong);
        q.set("hoNm", ho);
      } else if (dong || ho) {
        throw new Error("동·호는 함께 입력하거나 둘 다 비워 두세요.");
      }
      return apiGet(`/v1/vworld/apartment-prices?${q}`, headers);
    },
  },
  {
    id: "stock",
    tab: "주식",
    title: "한국 주식",
    skill: "korean-stock-search",
    fields: [
      {
        name: "stockMode",
        label: "모드 (search / base / trade)",
        default: "search",
      },
      { name: "q", label: "종목명·코드 (search)", placeholder: "삼성전자" },
      {
        name: "market",
        label: "시장 (base·trade)",
        placeholder: "KOSPI",
      },
      { name: "code", label: "종목코드 6자리 (base·trade)", placeholder: "005930" },
      {
        name: "bas_dd",
        label: "기준일 YYYYMMDD (선택)",
        placeholder: "",
      },
    ],
    path: null,
    async run(params) {
      const mode = (params.stockMode || "search").trim();
      const bas = params.bas_dd?.replace(/-/g, "");
      if (mode === "search") {
        if (!params.q) throw new Error("search 모드는 종목명·코드(q)가 필요합니다.");
        const q = new URLSearchParams({ q: params.q });
        if (bas) q.set("bas_dd", bas);
        return apiGet(`/v1/korean-stock/search?${q}`);
      }
      const market = params.market?.trim();
      const code = params.code?.trim();
      if (!market || !code) {
        throw new Error("base·trade 모드는 market과 code가 필요합니다.");
      }
      const q = new URLSearchParams({ market, code });
      if (bas) q.set("bas_dd", bas);
      const path =
        mode === "trade"
          ? "/v1/korean-stock/trade-info"
          : "/v1/korean-stock/base-info";
      return apiGet(`${path}?${q}`);
    },
  },
  {
    id: "coupang",
    tab: "쿠팡",
    title: "쿠팡 상품 검색",
    skill: "coupang-product-search",
    fields: [
      { name: "keyword", label: "검색어", placeholder: "무선청소기" },
      { name: "limit", label: "개수 (최대 10)", default: "5" },
    ],
    path: "/v1/coupang/products/search",
    disclaimer:
      "쿠팡 파트너스 링크가 포함될 수 있습니다. 가격·재고는 쿠팡 기준 참고용입니다.",
  },
  {
    id: "naver",
    tab: "네이버",
    title: "네이버 쇼핑",
    skill: "naver-shopping-search",
    fields: [
      { name: "q", label: "검색어", placeholder: "에어팟" },
      { name: "limit", label: "개수", default: "10" },
    ],
    path: "/v1/naver-shopping/search",
  },
  {
    id: "gas",
    tab: "주유",
    title: "근처 주유소 (좌표)",
    skill: "cheap-gas-nearby",
    fields: [
      {
        name: "x",
        label: "X (EPSG:5181, 예: 서울시청 근처)",
        placeholder: "313680",
      },
      {
        name: "y",
        label: "Y (EPSG:5181)",
        placeholder: "545015",
      },
      { name: "radius", label: "반경(m)", default: "1500" },
      { name: "prodcd", label: "유종코드 (B027=휘발유)", default: "B027" },
    ],
    path: "/v1/opinet/around",
    note: "GPS만으로는 Opinet 좌표 변환이 필요합니다. 추후 지오코딩 탭 추가 예정.",
  },
  {
    id: "waste",
    tab: "쓰레기",
    title: "생활쓰레기 배출",
    skill: "household-waste-info",
    fields: [{ name: "sgg", label: "시군구", placeholder: "강남구" }],
    path: "/v1/household-waste/info",
    buildQuery(p) {
      const q = new URLSearchParams();
      q.set("cond[SGG_NM::LIKE]", p.sgg);
      q.set("pageNo", "1");
      q.set("numOfRows", "100");
      return q;
    },
  },
  {
    id: "drug",
    tab: "약",
    title: "의약품 정보",
    skill: "mfds-drug-safety",
    fields: [
      { name: "itemName", label: "약 이름", placeholder: "타이레놀" },
      { name: "limit", label: "개수", default: "5" },
    ],
    path: "/v1/mfds/drug-safety/lookup",
  },
  {
    id: "kopis",
    tab: "공연",
    title: "KOPIS 공연",
    skill: "kopis-performance-search",
    fields: [
      {
        name: "start",
        label: "시작일 (YYYYMMDD)",
        placeholder: "비우면 오늘(KST)",
      },
      {
        name: "end",
        label: "종료일 (YYYYMMDD)",
        placeholder: "비우면 시작일+30일",
      },
      {
        name: "areaCode",
        label: "지역코드 (선택, 11=서울)",
        placeholder: "11",
      },
      { name: "limit", label: "개수", default: "10" },
      {
        name: "mt20id",
        label: "공연 ID (상세)",
        placeholder: "예: PF132236",
      },
      {
        name: "facilityQ",
        label: "공연장 검색어 (목록)",
        placeholder: "세종문화회관",
      },
      {
        name: "mt10id",
        label: "공연장 ID (상세)",
        placeholder: "시설 ID",
      },
    ],
    path: null,
    disclaimer: "조회만 가능합니다. 예매·결제는 공식 예매처에서 진행하세요.",
    async run(params) {
      const perfId = params.mt20id?.trim();
      if (perfId) {
        return apiGet(
          `/v1/kopis/performances/${encodeURIComponent(perfId)}`
        );
      }
      const facId = params.mt10id?.trim();
      if (facId) {
        return apiGet(
          `/v1/kopis/facilities/${encodeURIComponent(facId)}`
        );
      }
      const facQ = params.facilityQ?.trim();
      if (facQ) {
        const q = new URLSearchParams({ q: facQ });
        if (params.limit) q.set("limit", params.limit);
        return apiGet(`/v1/kopis/facilities?${q}`);
      }
      const start = params.start?.replace(/-/g, "") || kstYmd();
      const end =
        params.end?.replace(/-/g, "") || kstYmdAddDays(start, 30);
      const q = new URLSearchParams({ start, end });
      if (params.areaCode) q.set("areaCode", params.areaCode);
      if (params.limit) q.set("limit", params.limit);
      return apiGet(`/v1/kopis/performances?${q}`);
    },
  },
];

const VWORLD_KEY_STORAGE = "k-pocket-vworld-key";

function vworldHeaders(params) {
  const key = params.vworldKey?.trim();
  if (!key) {
    throw new Error(
      "VWorld API 키가 필요합니다. vworld.kr에서 발급 후 입력하세요."
    );
  }
  return { "x-k-skill-vworld-api-key": key };
}

async function buildingTitleFromAddress(address) {
  const geo = await apiGet(
    `/v1/kakao-local/geocode?${new URLSearchParams({ q: address, limit: "1" })}`
  );
  const doc =
    geo?.documents?.[0] ||
    geo?.results?.[0] ||
    (Array.isArray(geo) ? geo[0] : null);
  const addr = doc?.address || doc?.road_address || doc;
  if (!addr) throw new Error("주소를 찾지 못했습니다. PNU를 직접 입력해 보세요.");
  const pnu = String(doc?.pnu || addr?.pnu || "").replace(/\s/g, "");
  if (/^\d{19}$/.test(pnu)) {
    return apiGet(
      `/v1/building-register/title?${new URLSearchParams({ pnu })}`
    );
  }
  const bCode = String(addr.b_code || doc?.address?.b_code || "");
  if (bCode.length < 10) {
    throw new Error("법정동 코드를 확인할 수 없습니다. PNU를 직접 입력해 보세요.");
  }
  const sigunguCd = bCode.slice(0, 5);
  const bjdongCd = bCode.slice(5, 10);
  const platGbCd = addr.mountain_yn === "Y" ? "1" : "0";
  const bun = String(addr.main_address_no ?? "").padStart(4, "0");
  const ji = String(addr.sub_address_no ?? "0").padStart(4, "0");
  const q = new URLSearchParams({ sigunguCd, bjdongCd, platGbCd, bun, ji });
  return apiGet(`/v1/building-register/title?${q}`);
}

function kstYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}${m}${d}`;
}

function kstYmdAddDays(ymd, days) {
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  const utc = Date.UTC(y, mo, d + days);
  return kstYmd(new Date(utc));
}

async function apiGet(pathAndQuery, extraHeaders = {}) {
  const url = `${API_BASE}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;
  const res = await fetch(url, { headers: { ...extraHeaders } });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data?.message
        ? data.message
        : `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }
  return data;
}

function formatJson(data) {
  return JSON.stringify(data, null, 2);
}

function renderTool(tool) {
  const form = document.getElementById("tool-form");
  form.innerHTML = "";
  document.getElementById("tool-title").textContent = tool.title;
  document.getElementById("tool-skill").textContent = tool.skill;
  const disc = document.getElementById("tool-disclaimer");
  disc.textContent = tool.disclaimer || tool.note || "";
  disc.classList.toggle("hidden", !disc.textContent);

  for (const f of tool.fields) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = f.label;
    lab.htmlFor = `f-${f.name}`;
    const inp = document.createElement("input");
    inp.id = `f-${f.name}`;
    inp.name = f.name;
    inp.placeholder = f.placeholder || "";
    if (f.default) inp.value = f.default;
    wrap.append(lab, inp);
    form.appendChild(wrap);
  }

  const row = document.createElement("div");
  row.className = "row";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "조회";
  row.appendChild(submit);
  if (tool.geo) {
    const geo = document.createElement("button");
    geo.type = "button";
    geo.className = "secondary";
    geo.textContent = "현재 위치";
    geo.addEventListener("click", () => {
      if (!navigator.geolocation) {
        alert("이 브라우저는 위치를 지원하지 않습니다.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = form.querySelector('[name="lat"]');
          const lon = form.querySelector('[name="lon"]');
          if (lat) lat.value = String(pos.coords.latitude);
          if (lon) lon.value = String(pos.coords.longitude);
        },
        () => alert("위치 권한이 필요합니다."),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
    row.appendChild(geo);
  }
  form.appendChild(row);

  if (tool.id === "housing-price") {
    const saved = localStorage.getItem(VWORLD_KEY_STORAGE);
    const keyInput = form.querySelector('[name="vworldKey"]');
    if (saved && keyInput && !keyInput.value) keyInput.value = saved;
  }
}

function readParams(form, tool) {
  const params = {};
  for (const f of tool.fields) {
    const el = form.querySelector(`[name="${f.name}"]`);
    const v = el?.value?.trim() ?? "";
    if (v) params[f.name] = v;
  }
  return params;
}

async function runTool(tool, params) {
  if (tool.run) return tool.run(params);
  const q = tool.buildQuery
    ? tool.buildQuery(params)
    : new URLSearchParams(params);
  return apiGet(`${tool.path}?${q}`);
}

window.KPocket = {
  tools,
  runTool,
  getVworldKey: () => localStorage.getItem(VWORLD_KEY_STORAGE),
  setVworldKey: (key) => localStorage.setItem(VWORLD_KEY_STORAGE, key),
};

const fileWarning = document.getElementById("file-warning");
if (location.protocol === "file:" && fileWarning) {
  fileWarning.classList.remove("hidden");
}

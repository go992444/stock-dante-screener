/** 구어체 → k-skill 프록시 (규칙 기반, LLM 없음) */

const HELP_TEXT = `이렇게 말해 보세요 (예시):

· "강남역 지하철 언제 와?"
· "강남역 혼잡도 어때?"
· "오늘 서울 날씨" / "여기 날씨" (위치 허용)
· "삼성전자 주식"
· "쿠팡에서 무선청소기"
· "타이레놀 약 정보"
· "마포구 실거래 지역코드"
· "관세법 법령 검색"
· "역삼동 건축물대장" / PNU로 조회
· "래미안 공시가 2025" (VWorld 키는 한 번 "vworld 키 저장: 발급키" 로 설정)
· "이번 달 서울 공연" / "세종문화회관 공연장"

참고용 조회만 가능하고, 예매·결제·법률자문은 아닙니다.`;

let lastGeo = null;

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function pickTool(id) {
  return window.KPocket.tools.find((t) => t.id === id);
}

function saveVworldFromText(text) {
  const m = text.match(
    /(?:vworld|브이월드|공시가)\s*(?:api\s*)?키\s*(?:저장|설정)?\s*[:=]?\s*([A-F0-9-]{30,})/i
  );
  if (!m) return null;
  window.KPocket.setVworldKey(m[1].trim());
  return "VWorld API 키를 이 기기에 저장했어요. 이제 공시가·단지 검색을 말로 물어보면 됩니다.";
}

function extractStation(text) {
  const m = text.match(/([가-힣0-9]+역)/);
  if (m) return m[1].replace(/역$/, "") || m[1];
  const cleaned = text
    .replace(/지하철|전철|도착|언제|몇\s*분|열차|안내/gi, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words[words.length - 1]?.replace(/역$/, "") || "";
}

function extractArea(text) {
  const m = text.match(/([가-힣0-9]+역?)\s*(혼잡|인파|사람)/);
  if (m) return m[1].endsWith("역") ? m[1] : `${m[1]}역`;
  const m2 = text.match(/혼잡도?\s*([가-힣0-9]+)/);
  if (m2) return m2[1].endsWith("역") ? m2[1] : `${m2[1]}역`;
  return "강남역";
}

function extractKeyword(text, prefixes) {
  let s = text;
  for (const p of prefixes) {
    s = s.replace(p, "");
  }
  return s.replace(/^[에서으로]\s*/, "").trim() || text.trim();
}

function parseIntent(raw) {
  const text = normalize(raw);
  if (!text) return { type: "reply", text: HELP_TEXT };

  const keyMsg = saveVworldFromText(text);
  if (keyMsg) return { type: "reply", text: keyMsg };

  if (/^(도움|help|\?|뭐\s*물어|예시)/i.test(text)) {
    return { type: "reply", text: HELP_TEXT };
  }

  const needsGeo = /여기|현재\s*위치|근처/.test(text);

  if (/지하철|전철|도착|열차/.test(text) || /역\s*(언제|도착|몇)/.test(text)) {
    const station = extractStation(text);
    if (!station) {
      return { type: "reply", text: "어느 역인지 알려주세요. 예: 강남역 지하철 도착" };
    }
    return { type: "run", toolId: "subway", params: { stationName: station } };
  }

  if (/혼잡|인파|붐빈|crowd/i.test(text)) {
    const area = extractArea(text);
    return { type: "run", toolId: "density", params: { area } };
  }

  if (/날씨|기온|비\s*올|우산|맑|흐림/.test(text)) {
    if (needsGeo) {
      return { type: "run", toolId: "weather", params: { _useGeo: true } };
    }
    return {
      type: "run",
      toolId: "weather",
      params: { lat: "37.5665", lon: "126.9780" },
    };
  }

  if (/공연장/.test(text) && !/공연\s*목록/.test(text)) {
    const q = extractKeyword(text, [/공연장/gi, /검색/gi, /알려/gi, /어디/gi]);
    return { type: "run", toolId: "kopis", params: { facilityQ: q, limit: "8" } };
  }
  if (/공연|뮤지컬|연극|콘서트|kopis/i.test(text)) {
    const areaMap = { 서울: "11", 부산: "26", 대구: "27", 인천: "28" };
    let areaCode;
    for (const [k, v] of Object.entries(areaMap)) {
      if (text.includes(k)) areaCode = v;
    }
    const params = { limit: "8" };
    if (areaCode) params.areaCode = areaCode;
    return { type: "run", toolId: "kopis", params };
  }

  if (/쿠팡/.test(text)) {
    const keyword = extractKeyword(text, [/쿠팡/gi, /에서/gi, /검색/gi, /찾아/gi, /가격/gi]);
    return { type: "run", toolId: "coupang", params: { keyword, limit: "5" } };
  }

  if (/네이버|쇼핑/.test(text)) {
    const q = extractKeyword(text, [/네이버/gi, /쇼핑/gi, /에서/gi, /검색/gi]);
    return { type: "run", toolId: "naver", params: { q, limit: "8" } };
  }

  if (/주유|휘발유|경유|기름값|주유소/.test(text)) {
    return {
      type: "reply",
      text:
        "주유소는 좌표(Opinet)가 필요해서 아직 말로 ‘근처 주유소’만으로는 어렵습니다. 지하철·날씨·혼잡도처럼 말로 물어볼 수 있는 항목을 먼저 쓰고, 주유는 다음에 위치 연동을 넣을 예정입니다.",
    };
  }

  if (/쓰레기|재활용|배출|분리수거/.test(text)) {
    const m = text.match(/([가-힣]+구|[가-힣]+시)/);
    const sgg = m ? m[1] : extractKeyword(text, [/쓰레기/gi, /배출/gi, /재활용/gi]);
    if (!sgg) {
      return { type: "reply", text: "어느 구·시인지 알려주세요. 예: 강남구 쓰레기 배출 요일" };
    }
    return { type: "run", toolId: "waste", params: { sgg } };
  }

  if (/약|의약품|타이레놀|처방|효능/.test(text)) {
    const name = extractKeyword(text, [/약/gi, /의약품/gi, /정보/gi, /알려/gi, /검색/gi]);
    return { type: "run", toolId: "drug", params: { itemName: name, limit: "5" } };
  }

  if (/공시가|공시가격|공동주택\s*가격/.test(text)) {
    const yearM = text.match(/(20\d{2})/);
    const stdrYear = yearM ? yearM[1] : String(new Date().getFullYear());
    const pnuM = text.replace(/\s/g, "").match(/\d{19}/);
    if (pnuM) {
      return {
        type: "run",
        toolId: "housing-price",
        params: { priceMode: "prices", pnu: pnuM[0], stdrYear },
      };
    }
    const q = extractKeyword(text, [/공시가/gi, /공시가격/gi, /얼마/gi, /조회/gi]);
    return {
      type: "run",
      toolId: "housing-price",
      params: { priceMode: "search", query: q, type: "place" },
    };
  }

  if (/건축물|대장|표제부/.test(text)) {
    const pnuM = text.replace(/\s/g, "").match(/\d{19}/);
    if (pnuM) {
      return { type: "run", toolId: "building", params: { pnu: pnuM[0] } };
    }
    const addr = extractKeyword(text, [/건축물/gi, /대장/gi, /표제부/gi, /조회/gi]);
    return { type: "run", toolId: "building", params: { address: addr } };
  }

  if (/실거래|전월세|매매가|아파트\s*거래/.test(text)) {
    if (/지역\s*코드|법정동|lawd|코드\s*알려/.test(text)) {
      const q = extractKeyword(text, [/실거래/gi, /지역/gi, /코드/gi, /알려/gi]);
      return {
        type: "run",
        toolId: "real-estate",
        params: { kind: "region_code", q },
      };
    }
    const ym = text.match(/(20\d{2})\s*년?\s*(\d{1,2})\s*월?/);
    const deal_ymd = ym
      ? `${ym[1]}${ym[2].padStart(2, "0")}`
      : text.match(/(20\d{6})/)?.[1];
    const lawd = text.match(/\b\d{5}\b/)?.[0];
    const rent = /전세|월세|전월세|임대/.test(text);
    const q = extractKeyword(text, [/실거래/gi, /매매/gi, /전월세/gi]);
    if (!lawd || !deal_ymd) {
      return {
        type: "run",
        toolId: "real-estate",
        params: { kind: "region_code", q: q || "서울" },
      };
    }
    return {
      type: "run",
      toolId: "real-estate",
      params: {
        kind: rent ? "apartment_rent" : "apartment_trade",
        lawd_cd: lawd,
        deal_ymd,
      },
    };
  }

  if (/법령|법률|판례|조문|규정/.test(text)) {
    const prec = /판례/.test(text);
    const target = prec ? "prec" : "law";
    const query = extractKeyword(text, [/법령/gi, /법률/gi, /판례/gi, /검색/gi, /알려/gi]);
    return {
      type: "run",
      toolId: "law",
      params: { lawMode: "search", target, query },
    };
  }

  if (/주식|종목|시세|코스피|코스닥|주가/.test(text)) {
    const q = extractKeyword(text, [
      /주식/gi,
      /종목/gi,
      /시세/gi,
      /주가/gi,
      /검색/gi,
      /알려/gi,
    ]);
    const codeM = text.match(/\b(\d{6})\b/);
    if (codeM && /시세|현재가|거래/.test(text)) {
      return {
        type: "run",
        toolId: "stock",
        params: {
          stockMode: "trade",
          market: /코스닥/.test(text) ? "KOSDAQ" : "KOSPI",
          code: codeM[1],
        },
      };
    }
    return { type: "run", toolId: "stock", params: { stockMode: "search", q } };
  }

  return {
    type: "reply",
    text: `잘 모르겠어요. 아래처럼 말해 보시거나 "도움"이라고 입력해 주세요.\n\n${HELP_TEXT}`,
  };
}

function getGeo() {
  return new Promise((resolve, reject) => {
    if (lastGeo) return resolve(lastGeo);
    if (!navigator.geolocation) return reject(new Error("위치를 지원하지 않습니다."));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastGeo = { lat: String(pos.coords.latitude), lon: String(pos.coords.longitude) };
        resolve(lastGeo);
      },
      () => reject(new Error("위치 권한이 필요합니다. 설정에서 허용하거나 “서울 날씨”처럼 물어보세요.")),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

async function resolveParams(toolId, params) {
  const p = { ...params };
  if (toolId === "housing-price" && !p.vworldKey) {
    p.vworldKey = window.KPocket.getVworldKey() || "";
  }
  if (p._useGeo) {
    const g = await getGeo();
    p.lat = g.lat;
    p.lon = g.lon;
    delete p._useGeo;
  }
  if (toolId === "real-estate" && (!p.lawd_cd || !p.deal_ymd)) {
    delete p.lawd_cd;
    delete p.deal_ymd;
    if (!p.q) p.q = "서울";
    p.kind = "region_code";
  }
  return p;
}

function lines(arr) {
  return arr.filter(Boolean).join("\n");
}

/** 프록시가 XML 문자열을 주는 경우 (KOPIS 등) */
function parseKopisXmlDb(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  return [...doc.querySelectorAll("db")].map((db) => {
    const row = {};
    for (const el of db.children) {
      row[el.tagName] = el.textContent?.trim() ?? "";
    }
    return row;
  });
}

function normalizePayload(data, toolId) {
  if (typeof data === "string") {
    const t = data.trim();
    if (t.startsWith("<?xml") || (t.startsWith("<") && t.includes("<db"))) {
      return { items: parseKopisXmlDb(t) };
    }
    try {
      return JSON.parse(t);
    } catch {
      return data;
    }
  }
  if (data && typeof data === "object") {
    if (Array.isArray(data.items)) return data;
    const db = data.dbs?.db ?? data.db;
    if (db) {
      const list = Array.isArray(db) ? db : [db];
      return { items: list };
    }
    if (typeof data.raw === "string" && data.raw.includes("<db")) {
      return { items: parseKopisXmlDb(data.raw) };
    }
    if (typeof data.body === "string" && data.body.includes("<db")) {
      return { items: parseKopisXmlDb(data.body) };
    }
  }
  return data;
}

function summarizeKopis(data) {
  const payload = normalizePayload(data, "kopis");
  const items = payload?.items || (Array.isArray(payload) ? payload : []);
  if (!items.length) {
    return "조건에 맞는 공연·공연장을 찾지 못했어요. “이번 달 서울 공연”처럼 다시 물어보거나 공연장 이름을 넣어 보세요.";
  }

  const facilityList = items.every((it) => it.mt10id && !it.prfnm);
  if (facilityList) {
    return lines(
      items.slice(0, 8).map((it, i) => {
        const name = it.fcltynm || it.prfnm || "공연장";
        const addr = it.adres || it.addr || it.area || "";
        return `${i + 1}. ${name}${addr ? `\n   ${addr}` : ""}`;
      })
    );
  }

  return lines([
    `🎭 ${items.length}건 찾았어요. 아래 ${Math.min(8, items.length)}개만 적었습니다.`,
    "",
    ...items.slice(0, 8).map((it, i) => {
      const title = it.prfnm || "제목 없음";
      const place = it.fcltynm || "장소 미상";
      const genre = it.genrenm || "";
      const from = it.prfpdfrom || "";
      const to = it.prfpdto || "";
      let period = from;
      if (to && to !== from) period = `${from} ~ ${to}`;
      const state =
        it.prfstate && !/공연중/.test(it.prfstate) ? ` · ${it.prfstate}` : "";
      return `${i + 1}. ${title}${state}\n   ${place}${genre ? ` · ${genre}` : ""}\n   ${period || "일정 미상"}`;
    }),
    "",
    "예매·결제는 KOPIS가 아닌 공식 예매처에서 해야 합니다.",
  ]);
}

function summarize(toolId, data) {
  if (data == null) return "결과가 비었습니다.";
  data = normalizePayload(data, toolId);

  if (toolId === "subway") {
    const items = data?.realtimeArrivalList || data?.arrivals || data?.data || [];
    const list = Array.isArray(items) ? items : [items];
    if (!list.length) return lines(["도착 정보를 찾지 못했습니다.", jsonTail(data)]);
    return lines(
      list.slice(0, 6).map((a) => {
        const line = a.subwayLine || a.line || a.trainLineNm || "";
        const dest = a.bstatnNm || a.direction || a.trainLineNm || "";
        const msg = a.arvlMsg2 || a.arvlMsg3 || a.message || "";
        return `· ${line} ${dest} — ${msg}`.trim();
      })
    );
  }

  if (toolId === "density") {
    const area = data?.area || data?.AREA_NM || data?.name;
    const level =
      data?.congestionLevel ||
      data?.AREA_CONGEST_LVL ||
      data?.congestion ||
      data?.message;
    const pct = data?.congestionRate || data?.AREA_PPLTN_RATE;
    return lines([
      area ? `📍 ${area}` : null,
      level ? `혼잡: ${level}` : null,
      pct != null ? `지표: ${pct}` : null,
      !level && !pct ? jsonTail(data, 800) : null,
    ]);
  }

  if (toolId === "weather") {
    const cur = data?.current || data?.now || data?.forecast?.[0] || data;
    const temp = cur?.temp || cur?.temperature || cur?.T1H;
    const sky = cur?.sky || cur?.weather || cur?.WTXT || cur?.summary;
    const rain = cur?.precipitation || cur?.RN1 || cur?.pop;
    return lines([
      temp != null ? `기온 ${temp}°` : null,
      sky ? `날씨: ${sky}` : null,
      rain != null && rain !== "" ? `강수/확률: ${rain}` : null,
      temp == null && !sky ? jsonTail(data, 900) : null,
    ]);
  }

  if (toolId === "stock") {
    const items = data?.items || data?.output || data?.list || (Array.isArray(data) ? data : [data]);
    const list = Array.isArray(items) ? items : [items];
    return lines(
      list.slice(0, 5).map((it) => {
        const name = it?.name || it?.itmsNm || it?.hts_kor_isnm;
        const code = it?.code || it?.srtnCd || it?.mksc_shrn_iscd;
        const price = it?.price || it?.stck_prpr || it?.clpr;
        return `· ${name || "종목"} (${code || "?"}) ${price != null ? `— ${price}` : ""}`.trim();
      })
    ) || jsonTail(data, 1000);
  }

  if (toolId === "coupang" || toolId === "naver") {
    const items = data?.products || data?.items || data?.data || [];
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return jsonTail(data, 1000);
    return lines(
      list.slice(0, 5).map((it, i) => {
        const title = it?.title || it?.productName || it?.name;
        const price = it?.price || it?.lprice || it?.salePrice;
        return `${i + 1}. ${title}${price != null ? ` — ${price}원` : ""}`;
      })
    );
  }

  if (toolId === "drug") {
    const items = data?.items || data?.body || data?.result || [];
    const list = Array.isArray(items) ? items : [data];
    return lines(
      list.slice(0, 3).map((it) => {
        const name = it?.itemName || it?.ITEM_NAME || it?.name;
        const entp = it?.entpName || it?.ENTP_NAME;
        return `· ${name || "의약품"}${entp ? ` (${entp})` : ""}`;
      })
    ) || jsonTail(data, 800);
  }

  if (toolId === "waste") {
    return jsonTail(data, 1200);
  }

  if (toolId === "kopis") {
    return summarizeKopis(data);
  }

  if (toolId === "law" || toolId === "real-estate" || toolId === "building" || toolId === "housing-price") {
    if (typeof data === "string" && data.includes("<?xml")) {
      return "조회는 됐지만 XML 형식이라 요약이 어렵습니다. 질문을 더 구체적으로 해 주시거나 잠시 후 다시 시도해 주세요.";
    }
    return jsonTail(data, 1400);
  }

  return jsonTail(data, 1200);
}

function jsonTail(data, max = 1200) {
  if (typeof data === "string") {
    if (data.includes("<?xml") || data.includes("<db>")) {
      return summarizeKopis(data);
    }
    const t = data.length <= max ? data : data.slice(0, max) + "\n…";
    return t;
  }
  const s = JSON.stringify(data, null, 2);
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n… (일부만 표시)";
}

function appendMessage(role, text, extraClass = "") {
  const log = document.getElementById("chat-log");
  const div = document.createElement("div");
  div.className = `msg ${role} ${extraClass}`.trim();
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function onUserSend(text) {
  const intent = parseIntent(text);

  if (intent.type === "reply") {
    appendMessage("assistant", intent.text);
    return;
  }

  appendMessage("assistant", "조회 중…", "pending");

  const pending = document.querySelector("#chat-log .msg.pending");
  const t0 = performance.now();

  try {
    const tool = pickTool(intent.toolId);
    if (!tool) throw new Error("내부 오류: 도구를 찾을 수 없습니다.");
    const params = await resolveParams(intent.toolId, intent.params);
    const data = await window.KPocket.runTool(tool, params);
    const summary = summarize(intent.toolId, data);
    const ms = Math.round(performance.now() - t0);
    pending?.remove();
    appendMessage("assistant", `${summary}\n\n— ${tool.tab} · ${ms}ms`);
  } catch (err) {
    pending?.remove();
    appendMessage("assistant", err.message || String(err), "error");
  }
}

function initChat() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  if (!form || !input) return;

  appendMessage(
    "assistant",
    "안녕하세요. K-Pocket입니다. 궁금한 걸 말로 물어보세요.\n\n" + HELP_TEXT
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = normalize(input.value);
    if (!text) return;
    appendMessage("user", text);
    input.value = "";
    onUserSend(text);
  });
}

initChat();

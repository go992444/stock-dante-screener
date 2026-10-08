import { APP_VERSION, BUILD_LABEL } from "./version.js";

const feed = document.getElementById("feed");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function addBubble(role, html) {
  const wrap = el("div", `bubble ${role}`);
  const card = el("div", "card");
  card.innerHTML = html;
  wrap.appendChild(card);
  feed.appendChild(wrap);
  feed.scrollTop = feed.scrollHeight;
  return card;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatResult(data) {
  const parts = [];
  const ver =
    data.appVersion && data.buildLabel
      ? ` · 서버 v${data.appVersion} (${data.buildLabel})`
      : "";
  const termHint = data.relevanceTerms?.length
    ? ` · 키워드 ${data.relevanceTerms.slice(0, 5).join(", ")}`
    : "";
  const planHint =
    data.searchPlanSource === "universal"
      ? " · AI 검색계획"
      : data.plannerNote
        ? ` · ${data.plannerNote}`
        : "";
  parts.push(
    `<div class="meta">검색: ${escapeHtml(data.queriesTried?.slice(0, 4).join(" → ") ?? "")}${escapeHtml(termHint)}${escapeHtml(planHint)}${escapeHtml(ver)}</div>`
  );
  if (data.filterNote) {
    parts.push(`<div class="meta">${escapeHtml(data.filterNote)}</div>`);
  }

  if (data.statutes?.length) {
    parts.push("<h3>관련 법령 조문</h3>");
    for (const s of data.statutes) {
      const joLabel = s.articleLabel
        ? `제${s.articleLabel}`
        : `제${s.article}조`;
      parts.push(`<div><strong>${escapeHtml(s.title)} ${joLabel}</strong></div>`);
      for (const sec of s.sections) {
        if (!sec.text || sec.text.length < 5) continue;
        parts.push(
          `<div class="section-title">${escapeHtml(sec.title)}</div><div>${escapeHtml(sec.text)}</div>`
        );
      }
    }
  } else if (data.law?.items?.length) {
    parts.push("<h3>법령 목록</h3>");
    for (const it of data.law.items.slice(0, 3)) {
      parts.push(`<div>· ${escapeHtml(it.title)}</div>`);
    }
  }

  const withBrief = (data.precedents ?? []).filter((p) => p.brief?.sections?.length);
  if (withBrief.length) {
    parts.push("<h3>판례 요약 (판시·요지)</h3>");
    for (const p of withBrief) {
      const b = p.brief;
      const meta = p.list?.extra ? ` (${escapeHtml(p.list.extra)})` : "";
      parts.push(`<div><strong>${escapeHtml(b.title)}</strong>${meta}</div>`);
      for (const sec of b.sections) {
        parts.push(
          `<div class="section-title">${escapeHtml(sec.title)}</div><div>${escapeHtml(sec.text)}</div>`
        );
      }
    }
  }

  const listed = (data.precedents ?? []).filter((p) => p.list?.title);
  if (listed.length && !withBrief.length) {
    parts.push("<h3>판례</h3>");
    for (const p of listed.slice(0, 4)) {
      parts.push(`<div>· ${escapeHtml(p.list.title)} ${escapeHtml(p.list.extra || "")}</div>`);
    }
  }

  if (data.interpretations?.length) {
    parts.push("<h3>법령해석(유권해석)</h3>");
    for (const it of data.interpretations) {
      parts.push(`<div>· ${escapeHtml(it.title)} ${escapeHtml(it.extra || "")}</div>`);
    }
  }

  if (data.explanation?.status === "ok" && data.explanation.text) {
    const tok = data.explanation.tokens;
    const tokHint =
      tok?.input != null
        ? ` · 토큰 약 ${tok.input}입력+${tok.output ?? 0}출력`
        : "";
    const src =
      data.explanation.source === "fallback"
        ? "자료 기반 요약"
        : `Gemini ${data.explanation.model ?? ""}`;
    parts.push(
      `<h3>AI 정리 (참고)</h3><div class="explain">${escapeHtml(data.explanation.text)}</div><div class="meta">${escapeHtml(src)}${escapeHtml(tokHint)} · 위 조문·판례만 사용</div>`
    );
  } else if (data.explanation?.status === "error" && data.explanation.reason) {
    parts.push(
      `<div class="error">AI 정리를 불러오지 못했습니다: ${escapeHtml(data.explanation.reason)}</div>`
    );
  } else if (data.explanation?.status === "skipped" && data.explanation.reason) {
    parts.push(`<div class="meta">${escapeHtml(data.explanation.reason)}</div>`);
  }

  const hasContent =
    (data.statutes?.length ?? 0) > 0 ||
    withBrief.length > 0 ||
    listed.length > 0 ||
    (data.interpretations?.length ?? 0) > 0 ||
    (data.law?.items?.length ?? 0) > 0 ||
    (data.explanation?.status === "ok" && data.explanation.text);

  if (!hasContent) {
    if (data.hint) {
      parts.push(`<div class="error">${escapeHtml(data.hint)}</div>`);
    }
    parts.push(
      "<div>관련 결과가 없습니다. 사건 핵심어(연차수당, 임금체불, 명예훼손, 성희롱 등)로 짧게 다시 검색해 보세요.</div>"
    );
  }

  parts.push(`<div class="meta" style="margin-top:0.75rem">${escapeHtml(data.disclaimer)}</div>`);
  return parts.join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  addBubble("user", escapeHtml(question));
  input.value = "";
  sendBtn.disabled = true;

  const pending = addBubble(
    "bot",
    '<span class="typing">검색·AI 정리 중…</span>'
  );

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await res.json();
    if (!res.ok) {
      pending.innerHTML = `<span class="error">${escapeHtml(data.error || "오류")}</span>`;
      return;
    }
    pending.innerHTML = formatResult(data);
  } catch (err) {
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    pending.innerHTML = timeout
      ? '<span class="error">검색 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.</span>'
      : '<span class="error">네트워크 오류입니다.</span>';
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

const verEl = document.getElementById("app-version");
if (verEl) {
  verEl.textContent = `v${APP_VERSION}`;
}

fetch("/api/ask", { method: "GET" })
  .then((r) => r.json())
  .then((j) => {
    if (!verEl || !j.appVersion) return;
    const same =
      j.appVersion === APP_VERSION && j.buildLabel === BUILD_LABEL;
    verEl.textContent = same ? `v${j.appVersion} ✓` : `v${APP_VERSION}!`;
  })
  .catch(() => {});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => reg.update())
    .catch(() => {});
}

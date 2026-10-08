const MAX_OUTPUT_TOKENS = 1024;
const MIN_BODY_CHARS = 140;

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
];

function clip(text, max) {
  const s = String(text ?? "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

export function geminiModelsToTry() {
  const custom = process.env.GEMINI_MODEL?.trim();
  if (custom) return [custom, ...FALLBACK_MODELS.filter((m) => m !== custom)];
  return FALLBACK_MODELS;
}

export function sourceStrength(askResult) {
  const statutes = askResult.statutes?.length ?? 0;
  const precBriefs = (askResult.precedents ?? []).filter(
    (p) => p.brief?.sections?.length
  ).length;
  if (statutes > 0 || precBriefs > 0) return "good";
  if ((askResult.law?.items?.length ?? 0) > 0) return "weak";
  return "none";
}

function statuteTitle(s) {
  if (s.lawName && s.lawName !== "법령") return s.lawName;
  if (s.title && s.title !== "법령") return s.title;
  return "관련 법령";
}

export function buildExplainContext(askResult) {
  const blocks = [];
  blocks.push(`질문: ${askResult.question}`);
  if (askResult.relevanceTerms?.length) {
    blocks.push(`검색 키워드: ${askResult.relevanceTerms.join(", ")}`);
  }

  for (const s of (askResult.statutes ?? []).slice(0, 2)) {
    const label = s.articleLabel ? `제${s.articleLabel}` : `제${s.article}조`;
    const body = (s.sections ?? [])
      .map((sec) => sec.text)
      .filter((t) => t && t.length > 10)
      .join(" ");
    blocks.push(`[법령] ${statuteTitle(s)} ${label}\n${clip(body, 1100)}`);
  }

  for (const p of (askResult.precedents ?? []).slice(0, 2)) {
    if (!p.brief?.sections?.length) continue;
    const 판시 = p.brief.sections.find((x) => x.title === "판시사항");
    const body = 판시?.text ?? p.brief.sections[0]?.text ?? "";
    blocks.push(
      `[판례] ${p.brief.title || p.list?.title}\n${clip(body, 700)}`
    );
  }

  if (!blocks.some((b) => b.startsWith("[법령]") || b.startsWith("[판례]"))) {
    const laws = (askResult.law?.items ?? [])
      .slice(0, 3)
      .map((x) => x.title)
      .join(", ");
    if (laws) blocks.push(`[법령 목록만 확보] ${laws}`);
  }

  return blocks.join("\n\n");
}

function systemPrompt(strength, retry = false) {
  const weak =
    strength === "weak"
      ? "자료가 부족하면 부족함을 먼저 말하고, 확정적 해석은 하지 마세요."
      : "";
  const retryNote = retry
    ? "이전 답이 너무 짧았습니다. 반드시 길게, 문장을 끝까지 쓰세요."
    : "";
  return `한국 법령·판례 참고 설명 도우미(변호사 아님).

${retryNote}
작성 형식:
- 번호 목록(1. 2.) 사용 금지. 일반 문단만 사용.
- 최소 6문장, 400자 이상(한국어).
- 첫 문장: 질문이 어떤 법적 주제인지 한 줄.
- 다음: 제공된 조문이 무엇을 말하는지 쉽게 요약.
- 다음: 제공된 판례가 있으면 질문과 연결(없으면 생략).
- 다음: 실무에서 확인할 것(신고·증거·상담 등) 1~2문장.
- 마지막 문장: "위 내용은 참고용이며 법률 자문이 아닙니다."
- 제공된 텍스트 밖 조문·판례 창작 금지. 승소·유죄 단정 금지.
${weak}`;
}

export function isExplanationTooShort(text) {
  const t = String(text ?? "").trim();
  const compact = t.replace(/\s/g, "");
  if (compact.length < MIN_BODY_CHARS) return true;
  if (/제\d+조의?\d*$/.test(t.replace(/\s/g, ""))) return true;
  const sentences = t.split(/[.!?]\s|[。！？]\s*/).filter((s) => s.length > 8);
  if (sentences.length < 4) return true;
  return false;
}

export function localExplainFallback(askResult) {
  const paras = [];
  paras.push(
    `「${askResult.question}」에 대해, 아래는 검색된 조문·판례만 짧게 엮은 참고 요약입니다.`
  );

  for (const s of (askResult.statutes ?? []).slice(0, 2)) {
    const label = s.articleLabel ? `제${s.articleLabel}` : "";
    const body =
      s.sections?.map((x) => x.text).join(" ").replace(/\s+/g, " ").trim() ??
      "";
    if (body.length > 40) {
      paras.push(
        `${statuteTitle(s)} ${label}: ${clip(body, 320)}`
      );
    }
  }

  const p = (askResult.precedents ?? []).find((x) => x.brief?.sections?.length);
  const 판시 = p?.brief?.sections?.find((x) => x.title === "판시사항");
  if (판시?.text) {
    paras.push(`관련 판례 판시 요지: ${clip(판시.text, 280)}`);
  }

  paras.push(
    "회사 내부 신고·노무사·법률구조공단 등 전문 도움을 받는 것이 좋습니다. 위 내용은 참고용이며 법률 자문이 아닙니다."
  );

  return paras.join("\n\n");
}

async function generateOnce({ key, model, strength, context, retry = false }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const userText = retry
    ? `다음 자료만 사용해, 규칙을 지켜 충분히 긴 설명을 작성하세요.\n\n${context}`
    : `다음 자료만 보고 질문자 상황을 참고 수준으로 설명하세요.\n\n${context}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(strength, retry) }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: retry ? 0.35 : 0.2,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? `Gemini HTTP ${res.status}`;
    const retryable =
      /no longer available|not found|NOT_FOUND|invalid model/i.test(msg);
    return { ok: false, retryable, reason: msg };
  }

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  const finish = candidate?.finishReason;

  if (!text) {
    return { ok: false, retryable: true, reason: "AI 응답이 비었습니다." };
  }
  if (finish === "MAX_TOKENS" || isExplanationTooShort(text)) {
    return {
      ok: false,
      retryable: true,
      reason: "응답이 너무 짧습니다.",
      text,
    };
  }

  const usage = data?.usageMetadata;
  return {
    ok: true,
    text,
    model,
    tokens:
      usage?.promptTokenCount != null
        ? {
            input: usage.promptTokenCount,
            output: usage.candidatesTokenCount ?? 0,
          }
        : null,
  };
}

export async function explainWithGemini(askResult) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return {
      status: "skipped",
      text: null,
      reason: "GEMINI_API_KEY가 서버에 설정되지 않았습니다.",
    };
  }

  const strength = sourceStrength(askResult);
  if (strength === "none") {
    return {
      status: "skipped",
      text: null,
      reason: "설명할 조문·판례가 없어 AI 설명을 생략했습니다.",
    };
  }

  const context = buildExplainContext(askResult);
  const models = geminiModelsToTry();
  let lastReason = "AI 호출 실패";
  const deadline = Date.now() + 32_000;

  try {
    for (const model of models) {
      if (Date.now() > deadline) break;
      for (const retry of [false, true]) {
        if (Date.now() > deadline) break;
        try {
          const result = await generateOnce({
            key,
            model,
            strength,
            context,
            retry,
          });
          if (result.ok) {
            return {
              status: "ok",
              text: result.text,
              strength,
              model: result.model,
              tokens: result.tokens,
              source: "gemini",
            };
          }
          lastReason = result.reason;
          if (!result.retryable) break;
        } catch (e) {
          lastReason = e?.message ?? lastReason;
        }
      }
    }

    const fallback = localExplainFallback(askResult);
    if (!isExplanationTooShort(fallback)) {
      return {
        status: "ok",
        text: fallback,
        strength,
        model: "local-summary",
        source: "fallback",
      };
    }

    return { status: "error", text: null, reason: lastReason };
  } catch (e) {
    return {
      status: "error",
      text: null,
      reason: e?.message ?? "AI 호출 실패",
    };
  }
}

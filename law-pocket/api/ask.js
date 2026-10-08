import { APP_VERSION, BUILD_LABEL } from "../version.js";
import { runAsk } from "../lib/ask.mjs";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      appVersion: APP_VERSION,
      buildLabel: BUILD_LABEL,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 지원합니다." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const question = String(body?.question ?? "").trim();
  if (!question) {
    return res.status(400).json({ error: "question이 필요합니다." });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: "질문이 너무 깁니다." });
  }

  try {
    const result = await runAsk(question);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (e) {
    const msg = e?.message ?? "검색 실패";
    const code = msg.includes("LAW_OC") ? 503 : 502;
    return res.status(code).json({ error: msg });
  }
}

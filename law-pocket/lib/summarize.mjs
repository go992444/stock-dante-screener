import { pickFields } from "./format.mjs";

function stripHtml(text) {
  return String(text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function clip(text, max = 1200) {
  const s = String(text ?? "").trim();
  return s.length <= max ? s : s.slice(0, max).trimEnd() + "…";
}

function firstObject(node) {
  if (!node) return null;
  if (Array.isArray(node)) return node[0] ?? null;
  return node;
}

function extractXmlTag(xml, tag) {
  if (!xml) return "";
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = xml.match(
    new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, "i")
  );
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function articleTextFromUnit(u) {
  if (!u || typeof u !== "object") return "";
  const parts = [];
  const main = stripHtml(u.조문내용 ?? u.조문내용여부 ?? "");
  if (main && main.length > 3) parts.push(main);
  const title = stripHtml(u.조문제목 ?? u.조문제목내용 ?? "");
  if (title) parts.push(title);

  const hang = u.항;
  const hangs = Array.isArray(hang) ? hang : hang ? [hang] : [];
  for (const h of hangs) {
    const ht = stripHtml(h.항내용 ?? "");
    if (ht) parts.push(ht);
    const ho = h.호;
    const hos = Array.isArray(ho) ? ho : ho ? [ho] : [];
    for (const x of hos) {
      const xt = stripHtml(x.호내용 ?? "");
      if (xt) parts.push(xt);
    }
  }
  return parts.join("\n").trim();
}

function unwrapPrec(data) {
  const svc = data?.PrecService;
  const inner = firstObject(svc?.prec ?? svc?.판례);
  if (inner?.판시사항 || inner?.판결요지) return inner;
  if (svc?.판시사항) return svc;
  return inner ?? svc;
}

export function briefPrec(json, xml) {
  const p = unwrapPrec(json);
  const sections = [];
  if (p?.판시사항) {
    sections.push({ title: "판시사항", text: clip(stripHtml(p.판시사항), 2000) });
  }
  if (p?.판결요지) {
    sections.push({ title: "판결요지", text: clip(stripHtml(p.판결요지), 3500) });
  }
  if (!sections.length && xml) {
    for (const tag of ["판시사항", "판결요지"]) {
      const t = clip(stripHtml(extractXmlTag(xml, tag)), 3500);
      if (t.length > 8) sections.push({ title: tag, text: t });
    }
  }
  if (!sections.length && p?.판례내용) {
    sections.push({
      title: "판례내용(일부)",
      text: clip(stripHtml(p.판례내용), 2000),
    });
  }
  const title = p?.사건명 ?? p?.판례명 ?? "판례";
  return { title, sections };
}

export function briefLawArticles(json, xml = null) {
  const law = firstObject(json?.LawService?.법령 ?? json?.법령);
  const units = law?.조문?.조문단위;
  const list = Array.isArray(units) ? units : units ? [units] : [];
  const sections = [];

  for (const u of list) {
    const jo = u.조문번호 ?? u.조문?.조문번호;
    let raw = articleTextFromUnit(u);
    if (!raw || (raw.length < 15 && /^제\d+장/.test(raw))) continue;
    if (!raw && jo) raw = `제${jo}조`;
    sections.push({
      title: jo ? `제${jo}조` : "조문",
      text: clip(raw, 4500),
    });
    if (sections.length >= 3) break;
  }

  if (!sections.some((s) => s.text.length > 40) && xml) {
    const raw =
      extractXmlTag(xml, "조문내용") ||
      extractXmlTag(xml, "조문") ||
      extractXmlTag(xml, "법령내용");
    const body = clip(stripHtml(raw), 4500);
    if (body.length > 20) {
      sections.push({ title: "조문 본문", text: body });
    }
  }

  const title = law?.법령명_한글 ?? law?.법령명한글 ?? "법령";
  return { title, sections };
}

export function precDetailIds(item) {
  const row = item?._raw ?? item;
  const ids = [];
  const link = row.판례상세링크 ?? row.상세링크;
  if (link) {
    const m = String(link).match(/[?&](?:ID|id)=(\d+)/);
    if (m) ids.push(m[1]);
  }
  for (const x of [
    row.판례일련번호,
    row.판례정보일련번호,
    row.ID,
    row.id,
    row.일련번호,
    item.id,
  ]) {
    if (x != null) ids.push(String(x));
  }
  return [...new Set(ids)];
}

export function pickMainLaw(items) {
  return (
    items.find((i) => (i.법령명한글 ?? "") === "근로기준법") ??
    items.find((i) => !/(시행령|시행규칙)/.test(i.법령명한글 ?? "")) ??
    items[0]
  );
}

export { pickFields };

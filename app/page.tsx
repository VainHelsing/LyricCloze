"use client";

import { useMemo, useRef, useState } from "react";

type RowKind = "中文" | "日文" | "假名" | "罗马音";
type LyricRow = { id: string; kind: RowKind; source: string; tokens: string[] };
type LyricGroup = { id: string; rows: LyricRow[] };

const SAMPLE = `夜の風が窓をたたく
よるのかぜがまどをたたく
yoru no kaze ga mado o tataku
晚风轻敲窗边

君の声を思い出す
きみのこえをおもいだす
kimi no koe o omoidasu
想起你的声音`;

const SMALL_KANA = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゎ", "ャ", "ュ", "ョ", "ァ", "ィ", "ゥ", "ェ", "ォ", "ヮ"]);
const ROMAJI_UNITS = [
  "kya", "kyu", "kyo", "gya", "gyu", "gyo", "sha", "shu", "sho", "sya", "syu", "syo",
  "ja", "ju", "jo", "jya", "jyu", "jyo", "cha", "chu", "cho", "tya", "tyu", "tyo",
  "nya", "nyu", "nyo", "hya", "hyu", "hyo", "bya", "byu", "byo", "pya", "pyu", "pyo",
  "mya", "myu", "myo", "rya", "ryu", "ryo", "shi", "chi", "tsu", "fu",
  "ka", "ki", "ku", "ke", "ko", "ga", "gi", "gu", "ge", "go", "sa", "su", "se", "so",
  "za", "ji", "zu", "ze", "zo", "ta", "te", "to", "da", "de", "do", "na", "ni", "nu", "ne", "no",
  "ha", "hi", "he", "ho", "ba", "bi", "bu", "be", "bo", "pa", "pi", "pu", "pe", "po",
  "ma", "mi", "mu", "me", "mo", "ya", "yu", "yo", "ra", "ri", "ru", "re", "ro", "wa", "wo",
  "a", "i", "u", "e", "o", "n",
];

function splitRomajiWord(raw: string): string[] | null {
  let word = raw.toLowerCase().replace(/[^a-z'-]/g, "").replace(/[’-]/g, "");
  const result: string[] = [];
  while (word) {
    if (word.length > 1 && word[0] === word[1] && /[bcdfghjkmprstz]/.test(word[0])) {
      result.push(word[0]);
      word = word.slice(1);
      continue;
    }
    const unit = ROMAJI_UNITS.find((candidate) => word.startsWith(candidate));
    if (!unit) return null;
    result.push(unit);
    word = word.slice(unit.length);
  }
  return result.length ? result : null;
}

function parseRow(source: string, index: number): LyricRow | null {
  const clean = source.trim();
  if (!clean) return null;
  const hasKana = /[\u3040-\u30ff]/u.test(clean);
  const hasHan = /\p{Script=Han}/u.test(clean);
  const hasLatin = /[A-Za-z]/.test(clean);

  if (hasLatin && !hasKana && !hasHan) {
    const words = clean.split(/\s+/).map((word) => word.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, "")).filter(Boolean);
    const pieces = words.map(splitRomajiWord);
    if (!pieces.length || pieces.some((piece) => !piece)) return null;
    return { id: `row-${index}`, kind: "罗马音", source: clean, tokens: pieces.flatMap((piece) => piece ?? []) };
  }

  if (hasKana) {
    const tokens: string[] = [];
    for (const char of Array.from(clean)) {
      if (!/[\p{Script=Han}\u3040-\u30ffー]/u.test(char)) continue;
      if (SMALL_KANA.has(char) && tokens.length) tokens[tokens.length - 1] += char;
      else tokens.push(char);
    }
    return tokens.length ? { id: `row-${index}`, kind: hasHan ? "日文" : "假名", source: clean, tokens } : null;
  }

  if (hasHan && !hasLatin) {
    const tokens = Array.from(clean).filter((char) => /\p{Script=Han}/u.test(char));
    return tokens.length ? { id: `row-${index}`, kind: "中文", source: clean, tokens } : null;
  }

  return null;
}

function parseLyrics(text: string): { groups: LyricGroup[]; ignored: number } {
  const groups: LyricGroup[] = [];
  let current: LyricRow[] = [];
  let ignored = 0;
  const flush = () => {
    if (current.length) groups.push({ id: `group-${groups.length}`, rows: current });
    current = [];
  };

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return flush();
    const row = parseRow(line, index);
    if (!row) { ignored += 1; return; }
    if (current.some((item) => item.kind === row.kind)) flush();
    current.push(row);
  });
  flush();
  return { groups, ignored };
}

function markdownForRow(row: LyricRow, answers: Record<string, string>) {
  const chunks: string[] = [];
  for (let start = 0; start < row.tokens.length; start += 12) {
    const tokens = row.tokens.slice(start, start + 12);
    const values = tokens.map((_, offset) => answers[`${row.id}-${start + offset}`]?.trim() || "＿");
    chunks.push([
      `| ${row.kind} | ${tokens.join(" | ")} |`,
      `| :--- | ${tokens.map(() => ":---:").join(" | ")} |`,
      `| 填空 | ${values.join(" | ")} |`,
    ].join("\n"));
  }
  return chunks.join("\n\n");
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export default function Home() {
  const [draft, setDraft] = useState(SAMPLE);
  const [source, setSource] = useState(SAMPLE);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const parsed = useMemo(() => parseLyrics(source), [source]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const allRows = parsed.groups.flatMap((group) => group.rows);

  const focusRelative = (row: LyricRow, index: number, direction: 1 | -1) => {
    const next = Math.max(0, Math.min(row.tokens.length - 1, index + direction));
    inputs.current[`${row.id}-${next}`]?.focus();
  };
  const handleGenerate = () => {
    setSource(draft);
    setAnswers({});
    requestAnimationFrame(() => document.querySelector<HTMLElement>("#practice")?.scrollIntoView({ behavior: "smooth" }));
  };
  const handleCopy = async (id: string, rows: LyricRow[]) => {
    await copyText(rows.map((row) => markdownForRow(row, answers)).join("\n\n"));
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="词格首页"><span>词</span>格</a>
        <div className="topnote"><i /> 本地处理 · 内容不会上传</div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">LYRIC CLOZE MAKER · 歌词填空生成器</div>
        <h1>把歌词，变成<br /><em>一格一音。</em></h1>
        <p className="intro">粘贴中文、日文或罗马音歌词。系统会识别每一个字与日语拍，生成逐格练习，并保持原文与填空严格对应。</p>
        <div className="composer">
          <div className="composer-head">
            <label htmlFor="lyrics">粘贴歌词</label>
            <button className="text-button" onClick={() => setDraft(SAMPLE)}>使用示例</button>
          </div>
          <textarea id="lyrics" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} placeholder="每种版本各占一行，例如：&#10;君の声を思い出す&#10;きみのこえをおもいだす&#10;kimi no koe o omoidasu&#10;想起你的声音" />
          <div className="composer-foot">
            <p>相邻的中文、日文、罗马音会自动归为一组。普通英文行将忽略。</p>
            <button className="primary" onClick={handleGenerate}>生成填空 <span>↘</span></button>
          </div>
        </div>
      </section>

      <section className="practice" id="practice">
        <div className="section-head">
          <div><div className="eyebrow">PRACTICE SHEET · 练习页</div><h2>逐字练习</h2></div>
          <button className="outline" disabled={!allRows.length} onClick={() => handleCopy("all", allRows)}>{copied === "all" ? "已复制" : "复制全部 Markdown"}</button>
        </div>
        {parsed.ignored > 0 && <div className="notice"><b>{parsed.ignored}</b> 行内容未读取：仅支持中文、日文，以及可识别的日语罗马音。</div>}
        {!allRows.length && <div className="empty">还没有可练习的歌词。请在上方粘贴内容后生成。</div>}
        <div className="sheets">
          {parsed.groups.map((group, groupIndex) => (
            <article className="sheet" key={group.id}>
              <div className="sheet-title"><span>{String(groupIndex + 1).padStart(2, "0")}</span><button onClick={() => handleCopy(group.id, group.rows)}>{copied === group.id ? "已复制" : "复制本段"}</button></div>
              {group.rows.map((row) => (
                <div className="lyric-row" key={row.id}>
                  <div className="row-meta"><span>{row.kind}</span><small>{row.tokens.length} 格</small></div>
                  <div className="token-grid">
                    {row.tokens.map((token, index) => {
                      const key = `${row.id}-${index}`;
                      return (
                        <label className="token-pair" key={key}>
                          <span className="token">{token}</span>
                          <input ref={(node) => { inputs.current[key] = node; }} value={answers[key] ?? ""}
                            onChange={(event) => {
                              const limit = Array.from(token).length;
                              const value = Array.from(event.target.value).slice(0, limit).join("");
                              setAnswers((current) => ({ ...current, [key]: value }));
                              if (!event.nativeEvent.isComposing && Array.from(value).length >= limit) focusRelative(row, index, 1);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Backspace" && !answers[key] && index > 0) focusRelative(row, index, -1);
                              if (event.key === "ArrowLeft") focusRelative(row, index, -1);
                              if (event.key === "ArrowRight") focusRelative(row, index, 1);
                            }} inputMode="text" maxLength={Array.from(token).length} aria-label={`${row.kind}“${token}”的填空`} autoComplete="off" />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>
      <footer><span>词格 / LYRIC CLOZE</span><p>中文按字、日文按拍、罗马音按音节拆分。标点不生成格子。</p></footer>
    </main>
  );
}

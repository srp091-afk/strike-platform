import type { ReactNode } from "react";

/**
 * Лёгкий Markdown для пузырей виджета (без зависимостей и без innerHTML):
 * **жирный**, *курсив*, `код`, ссылки http(s), списки «- / * / 1.» и переносы строк.
 * Всё, что не распознано, остаётся обычным текстом, поэтому разметка модели
 * не может внедрить HTML.
 */

const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\*[^*\s][^*\n]*?\*|https?:\/\/[^\s<]+)/g;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;

function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const id = `${key}-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={id} className="font-semibold">{inline(token.slice(2, -2), id)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={id} className="rounded bg-black/40 px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(<em key={id}>{inline(token.slice(1, -1), id)}</em>);
    } else {
      const url = token.replace(/[.,;:!?)]+$/, "");
      nodes.push(
        <a key={id} href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
          {url}
        </a>,
      );
      if (url.length < token.length) nodes.push(token.slice(url.length));
    }
    last = at + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function WidgetMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key}>
        {paragraph.map((line, i) => (
          <span key={i}>
            {i > 0 ? <br /> : null}
            {inline(line, `${key}-${i}`)}
          </span>
        ))}
      </p>,
    );
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    const key = `l${blocks.length}`;
    const items = list.items.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key} start={list.start} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  }

  for (const line of lines) {
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      list.items.push((bullet ?? ordered)![bullet ? 1 : 2]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div className="grid gap-2 text-sm leading-6 break-words">{blocks}</div>;
}

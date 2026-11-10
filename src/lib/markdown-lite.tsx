import type { ReactNode } from "react";

/** Rendu minimal (titres, listes, gras, code, paragraphes) pour les guides internes. Aucun HTML brut n'est interprété. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.startsWith("`") ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

export function MarkdownLite({ source }: { source: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(
      <Tag
        key={out.length}
        className={`my-3 space-y-1 pl-6 ${list.ordered ? "list-decimal" : "list-disc"}`}
      >
        {list.items.map((t, i) => (
          <li key={i}>{inline(t)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const line of source.split("\n")) {
    const h = /^(#{1,3})\s+(.*)/.exec(line);
    const ul = /^\s*[-*]\s+(.*)/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += " " + line.trim();
      continue;
    }
    flush();
    if (h) {
      const level = h[1]!.length;
      const cls =
        level === 1
          ? "mt-2 text-2xl font-bold"
          : level === 2
            ? "mt-8 border-b pb-1 text-xl font-semibold"
            : "mt-5 font-semibold";
      const Tag = (level === 1 ? "h2" : level === 2 ? "h2" : "h3") as "h2" | "h3";
      out.push(
        <Tag key={out.length} className={cls}>
          {inline(h[2]!)}
        </Tag>,
      );
    } else if (line.trim()) {
      out.push(
        <p key={out.length} className="my-3 leading-relaxed">
          {inline(line.trim())}
        </p>,
      );
    }
  }
  flush();
  return <div className="max-w-3xl">{out}</div>;
}

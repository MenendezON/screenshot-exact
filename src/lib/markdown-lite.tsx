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
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i]!);
      out.push(
        <pre key={out.length} className="my-3 overflow-x-auto rounded bg-muted p-3 text-xs">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      flush();
      const cells = (l: string) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const head = cells(line);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) body.push(cells(lines[i++]!));
      i--;
      out.push(
        <div key={out.length} className="my-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left">
              <tr>
                {head.map((c, k) => (
                  <th key={k} className="px-3 py-2 font-medium">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k} className="border-b last:border-0">
                  {r.map((c, m) => (
                    <td key={m} className="px-3 py-2 align-top">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
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
  return <div className="max-w-4xl">{out}</div>;
}

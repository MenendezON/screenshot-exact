import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownLite } from "@/lib/markdown-lite";

describe("MarkdownLite", () => {
  it("rend tableaux, blocs de code, listes et gras sans HTML brut", () => {
    const { container } = render(
      <MarkdownLite
        source={
          "## Titre\n\n| A | B |\n| --- | --- |\n| 1 | **2** |\n\n```\ncurl x\n```\n\n- un\n- deux\n\n<script>alert(1)</script>"
        }
      />,
    );
    expect(container.querySelector("table")?.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector("td strong")?.textContent).toBe("2");
    expect(container.querySelector("pre")?.textContent).toBe("curl x");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("script")).toBeNull();
  });
});

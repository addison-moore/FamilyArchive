import { describe, expect, it } from "vitest";

import { renderBrandedEmail } from "./email-template";

describe("renderBrandedEmail", () => {
  it('escapes &, <, >, and " in every interpolated slot', () => {
    const html = renderBrandedEmail({
      heading: 'Reunion <2026> & "Picnic"',
      bodyLines: ['Tom & Jerry say "hello" <soon>'],
      cta: { label: "Open <it>", url: "https://example.com/?a=1&b=2" },
      footerNote: 'Note & <aside> "quoted"',
    });
    expect(html).toContain("Reunion &lt;2026&gt; &amp; &quot;Picnic&quot;");
    expect(html).toContain("Tom &amp; Jerry say &quot;hello&quot; &lt;soon&gt;");
    expect(html).toContain("Open &lt;it&gt;");
    expect(html).toContain("https://example.com/?a=1&amp;b=2");
    expect(html).toContain("Note &amp; &lt;aside&gt; &quot;quoted&quot;");
    expect(html).not.toContain("<2026>");
    expect(html).not.toContain("<soon>");
    expect(html).not.toContain("<aside>");
  });

  it("keeps a hostile URL inside its double-quoted href attribute", () => {
    const html = renderBrandedEmail({
      heading: "H",
      bodyLines: [],
      cta: { label: "Go", url: 'https://x.test/" onmouseover="steal()' },
    });
    expect(html).toContain("&quot; onmouseover=&quot;steal()");
    expect(html).not.toContain('" onmouseover="steal()');
  });

  it("leaves apostrophes alone — safe because attributes are always double-quoted", () => {
    const html = renderBrandedEmail({ heading: "It's a family reunion", bodyLines: [] });
    expect(html).toContain("It's a family reunion");
    // The invariant that makes unescaped ' safe: no attribute is single-quoted.
    expect(html).not.toMatch(/<[a-z]+ [^>]*=\s*'/);
  });

  it("renders body lines in order and omits the CTA block when absent", () => {
    const html = renderBrandedEmail({ heading: "H", bodyLines: ["first", "second"] });
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html).not.toContain("<a ");
  });
});

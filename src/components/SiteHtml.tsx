// Renders a website section exported from the design canvas (src/site/*.ts).
// The HTML is Doova's own static content, generated at build time; nothing user-supplied goes in.
// For the motion layer, line doodles get pathLength="1" so CSS can draw them in (see website.css).
const LINE_DOODLE = /<svg class="dd[^"]*\bdd-(?:squig|under|arrow|loop)\b[^"]*"[\s\S]*?<\/svg>/g;

export function SiteHtml({ html }: { html: string }) {
  const out = html.replace(LINE_DOODLE, (svg) => svg.replace(/<path (?![^>]*pathLength)/g, '<path pathLength="1" '));
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: out }} />;
}

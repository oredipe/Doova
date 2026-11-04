// Renders a website section exported from the design canvas (src/site/*.ts).
// The HTML is Doova's own static content, generated at build time; nothing user-supplied goes in.
export function SiteHtml({ html }: { html: string }) {
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

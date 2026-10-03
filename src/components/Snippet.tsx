/** Renders a Postgres ts_headline snippet without using innerHTML: only <mark> is honoured. */
export function Snippet({ html }: { html: string }) {
  const parts = html.split(/(<mark>[\s\S]*?<\/mark>)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("<mark>") ? <mark key={i}>{p.slice(6, -7)}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

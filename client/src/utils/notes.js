// Renders basic markdown (**bold** and *italic*) as React elements — never raw HTML, so no sanitization is needed.
// NOTE: we DO NOT support underscores as they are more likely to show up in financial comments like "one_time_fee"
// (of course, this can be changed in the future)
const TOKEN_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export function renderNotes(text) {
  if (!text)
    return text;

  return text.split(TOKEN_RE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;

    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i}>{part.slice(1, -1)}</em>;

    return part;
  });
}

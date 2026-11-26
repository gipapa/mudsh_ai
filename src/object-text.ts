// Capture complete file names (including dotfiles) and directory references in room prose.
// A sentence-ending period stays with the surrounding text, e.g. "under records/."
const reference = /((?<![\w./-])(?:[\w.-]+\/)*(?:[\w-]+(?:\.[a-zA-Z][\w-]*)+|\.[\w-]+|[\w-]+\/))(?![\w/-])/gu;

export function objectText(text: string, highlight: (reference: string) => string) {
  return text.replace(reference, value => highlight(value));
}

export function appendObjectText(parent: HTMLElement, text: string) {
  for (const [index, part] of text.split(reference).entries()) {
    if (index % 2) {
      const span = document.createElement("span");
      span.className = "object-ref";
      span.textContent = part;
      parent.append(span);
    } else if (part) parent.append(part);
  }
}

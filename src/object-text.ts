// Capture complete file names (including dotfiles) and directory references in room prose.
// A sentence-ending period stays with the surrounding text, e.g. "under records/."
const reference = /((?<![\w./-])(?:[\w.-]+\/)*(?:[\w-]+(?:\.[a-zA-Z][\w-]*)+|\.[\w-]+|[\w-]+\/))(?![\w/-])/gu;

export function isHelpCommand(line: string) {
  return /^help(?:\s|$)/iu.test(line.trimStart());
}

type TextRole = "object-ref" | "help-command";

function* worldParts(text: string, help: boolean): Generator<[string, TextRole?]> {
  for (const [index, line] of text.split("\n").entries()) {
    if (index) yield ["\n"];
    const command = help ? /^(\S.*?)(?= {2,}\S)/u.exec(line) : null;
    const exit = /^((?:(?:north|east|south|west)[a-z-]*|back) · \[)(.*)\]$/u.exec(line);
    if (command) {
      yield [command[0], "help-command"];
      yield [line.slice(command[0].length)];
    } else if (exit) {
      yield [exit[1]];
      yield [exit[2], "object-ref"];
      yield ["]"];
    } else {
      for (const [partIndex, part] of line.split(reference).entries()) {
        if (part) yield [part, partIndex % 2 ? "object-ref" : undefined];
      }
    }
  }
}

export function highlightWorldText(text: string, highlight: (text: string, role: TextRole) => string, help = false) {
  return Array.from(worldParts(text, help), ([part, role]) => role ? highlight(part, role) : part).join("");
}

export function appendWorldText(parent: HTMLElement, text: string, help = false) {
  for (const [part, role] of worldParts(text, help)) {
    if (role) {
      const span = document.createElement("span");
      span.className = role;
      span.textContent = part;
      parent.append(span);
    } else parent.append(part);
  }
}

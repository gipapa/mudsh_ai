import { highlightWorldText } from "./object-text.ts";

export const safeText = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu,"");
const colors = {prompt:32, sprite:36, error:31, "object-ref":34, "help-command":33} as const;

export function color(text: string, role: keyof typeof colors) {
  return process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb"
    ? `\x1b[${colors[role]}m${text}\x1b[0m` : text;
}

export function terminalWorldText(text: string, help = false) {
  return highlightWorldText(safeText(text), color, help);
}

export function parseFrontmatter(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const raw = match[1];
  const body = match[2].trim();
  const frontmatter: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> }[] = [
    { indent: -1, obj: frontmatter },
  ];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    while (
      stack.length > 1 &&
      stack[stack.length - 1].indent >= indent
    ) {
      stack.pop();
    }

    if (value === "") {
      const newObj: Record<string, unknown> = {};
      (stack[stack.length - 1].obj)[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      (stack[stack.length - 1].obj)[key] = parseScalar(value);
    }
  }

  return { frontmatter, body };
}

function parseScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") return num;
  return value;
}

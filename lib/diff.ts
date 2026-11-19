// ============================================================================
// Word-level diff for the approval queue.
//
// When a rep edits a draft, the edit is both the copy that ships and the
// preference signal the learning layer records. Showing exactly what changed
// lets the rep check the edit before approving, and lets anyone reading the
// audit trail later see what the model got wrong.
//
// Longest-common-subsequence over whitespace-preserving tokens. Outreach copy
// is ~100 words, so O(n*m) is trivial; above MAX_TOKENS we fall back to a
// whole-text replacement rather than allocate a huge table.
// ============================================================================

export type DiffSegment = { type: "same" | "add" | "del"; text: string };

const MAX_TOKENS = 1500;

/** Splits into words and the whitespace after them, so joining tokens is lossless. */
export function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export function wordDiff(before: string, after: string): DiffSegment[] {
  if (before === after) return before ? [{ type: "same", text: before }] : [];
  const a = tokenize(before);
  const b = tokenize(after);

  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      ...(before ? [{ type: "del" as const, text: before }] : []),
      ...(after ? [{ type: "add" as const, text: after }] : []),
    ];
  }

  // Compare words ignoring trailing whitespace, so re-wrapping a line is not
  // reported as rewriting every word on it.
  const key = (t: string) => t.trimEnd();

  // lcs[i][j] = LCS length of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffSegment[] = [];
  const push = (type: DiffSegment["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      // Keep the edited spacing: the output is what ships.
      push("same", b[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("del", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return out;
}

/** Share of the original's words the edit removed or replaced, 0..1. */
export function editRatio(before: string, after: string): number {
  const total = tokenize(before).filter((t) => t.trim()).length;
  if (!total) return after.trim() ? 1 : 0;
  const removed = wordDiff(before, after)
    .filter((s) => s.type === "del")
    .reduce((n, s) => n + tokenize(s.text).filter((t) => t.trim()).length, 0);
  return Math.min(1, removed / total);
}

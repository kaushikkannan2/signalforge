import { test } from "node:test";
import assert from "node:assert/strict";
import { editRatio, tokenize, wordDiff } from "../lib/diff.ts";

const join = (segs: { type: string; text: string }[], keep: string[]) =>
  segs.filter((s) => keep.includes(s.type)).map((s) => s.text).join("");

test("tokenize is lossless", () => {
  const t = "Hi Dana,\n\nSaw the  Series B. ";
  assert.equal(tokenize(t).join(""), t);
});

test("identical text is a single unchanged segment", () => {
  assert.deepEqual(wordDiff("same words", "same words"), [{ type: "same", text: "same words" }]);
  assert.deepEqual(wordDiff("", ""), []);
});

test("same + add reconstructs the edit; same + del reconstructs the original words", () => {
  const before = "Saw you raised a Series B last week and are hiring SDRs.";
  const after = "Congrats on the Series B. Saw you are hiring three SDRs.";
  const segs = wordDiff(before, after);
  assert.equal(join(segs, ["same", "add"]), after);
  const words = (s: string) => s.split(/\s+/).filter(Boolean);
  assert.deepEqual(words(join(segs, ["same", "del"])), words(before));
});

test("a one-word swap is reported as one deletion and one insertion", () => {
  const segs = wordDiff("a quick call", "a short call");
  assert.deepEqual(
    segs.filter((s) => s.type !== "same").map((s) => [s.type, s.text.trim()]),
    [
      ["del", "quick"],
      ["add", "short"],
    ],
  );
});

test("re-wrapping whitespace alone is not a word change", () => {
  const segs = wordDiff("one two three", "one two\nthree");
  assert.ok(segs.every((s) => s.type === "same"));
});

test("editRatio is the share of original words removed or replaced", () => {
  assert.equal(editRatio("a b c d", "a b c d"), 0);
  assert.equal(editRatio("a b c d", "a b x d"), 0.25);
  assert.equal(editRatio("a b c d", "totally new"), 1);
  assert.equal(editRatio("", "new"), 1);
});

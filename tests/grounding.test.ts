import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  B2B_CHECKLIST,
  actionableIcp,
  applyGrounding,
  blankValue,
  capConfidence,
  coverageOf,
  groundingSource,
  isActionable,
  isEmptyValue,
  quoteExists,
} from "../lib/grounding.ts";

const SOURCE =
  "We make $12 meal kits that help busy parents get dinner on the table in 15 minutes. It’s sold to start-ups.";

const raw = (over: Record<string, unknown> = {}) => ({
  value: ["Parents"],
  confidence: 0.9,
  rationale: "Because.",
  basis: "stated" as const,
  quotes: ["busy parents"],
  ...over,
});

describe("quoteExists", () => {
  it("finds exact passages regardless of case and spacing", () => {
    assert.equal(quoteExists("Busy   PARENTS", SOURCE), true);
  });
  it("folds curly quotes and dashes", () => {
    assert.equal(quoteExists("It's sold to start—ups", SOURCE), true);
  });
  it("keeps short numeric quotes", () => {
    assert.equal(quoteExists("$12", SOURCE), true);
  });
  it("rejects invented text", () => {
    assert.equal(quoteExists("enterprise customers", SOURCE), false);
  });
  it("rejects a match inside a longer word", () => {
    assert.equal(quoteExists("art", SOURCE), false);
  });
  it("rejects trivially short quotes", () => {
    assert.equal(quoteExists("a", SOURCE), false);
  });
  it("ignores quotation marks wrapped around the passage", () => {
    assert.equal(quoteExists('"busy parents"', SOURCE), true);
  });
});

describe("applyGrounding", () => {
  it("keeps a stated field whose quote is real", () => {
    const f = applyGrounding(raw(), SOURCE);
    assert.equal(f.grounding.basis, "stated");
    assert.deepEqual(f.grounding.quotes, ["busy parents"]);
    assert.equal(f.confidence, 0.9);
    assert.equal(f.grounding.downgraded, undefined);
  });

  it("downgrades a stated field whose quote is invented", () => {
    const f = applyGrounding(raw({ quotes: ["Fortune 500 buyers"] }), SOURCE);
    assert.equal(f.grounding.basis, "assumed");
    assert.equal(f.grounding.downgraded?.from, "stated");
    assert.deepEqual(f.grounding.quotes, []);
    assert.equal(f.confidence, 0.45);
  });

  it("downgrades a derived field with no quote", () => {
    const f = applyGrounding(raw({ basis: "derived", quotes: [] }), SOURCE);
    assert.equal(f.grounding.basis, "assumed");
  });

  it("treats a weakly supported derived field as a best guess", () => {
    const f = applyGrounding(raw({ basis: "derived", confidence: 0.35 }), SOURCE);
    assert.equal(f.grounding.basis, "assumed");
    assert.equal(f.grounding.downgraded?.from, "derived");
    assert.deepEqual(f.grounding.quotes, []);
  });

  it("keeps a derived field at the confidence threshold", () => {
    const f = applyGrounding(raw({ basis: "derived", confidence: 0.5 }), SOURCE);
    assert.equal(f.grounding.basis, "derived");
  });

  it("keeps only the verified quotes when some are real", () => {
    const f = applyGrounding(raw({ quotes: ["busy parents", "made up"] }), SOURCE);
    assert.equal(f.grounding.basis, "stated");
    assert.deepEqual(f.grounding.quotes, ["busy parents"]);
  });

  it("caps a derived field", () => {
    const f = applyGrounding(raw({ basis: "derived", confidence: 0.99 }), SOURCE);
    assert.equal(f.confidence, 0.8);
  });

  it("blanks whatever the model put in an unknown field", () => {
    const f = applyGrounding(
      raw({ basis: "unknown", value: { min: 10, max: 50, tierLabel: "SMB" }, quotes: [] }),
      SOURCE,
    );
    assert.deepEqual(f.value, { min: 0, max: 0, tierLabel: "" });
    assert.equal(f.confidence, 0);
  });

  it("treats a claimed answer with an empty value as a gap", () => {
    const f = applyGrounding(raw({ value: [] }), SOURCE);
    assert.equal(f.grounding.basis, "unknown");
    assert.equal(f.confidence, 0);
  });
});

describe("value helpers", () => {
  it("recognises empty values", () => {
    assert.equal(isEmptyValue([]), true);
    assert.equal(isEmptyValue({ min: 0, max: 0, tierLabel: "Unknown" }), true);
    assert.equal(isEmptyValue({ min: 0, max: 50, tierLabel: "" }), false);
    assert.equal(isEmptyValue(["x"]), false);
  });
  it("blanks nested shapes", () => {
    assert.deepEqual(blankValue({ a: 1, b: "x", c: [1] }), { a: 0, b: "", c: [] });
  });
  it("never raises confidence", () => {
    assert.equal(capConfidence(0.2, "assumed"), 0.2);
  });
});

describe("isActionable", () => {
  const f = (basis: "stated" | "derived" | "assumed" | "unknown") => ({
    grounding: { basis, quotes: [] },
  });
  it("allows stated and derived only", () => {
    assert.equal(isActionable(f("stated")), true);
    assert.equal(isActionable(f("derived")), true);
    assert.equal(isActionable(f("assumed")), false);
    assert.equal(isActionable(f("unknown")), false);
  });
  it("leaves fields without a grounding record alone", () => {
    assert.equal(isActionable({}), true);
  });
});

describe("groundingSource", () => {
  it("collects only what the founder provided", () => {
    const text = groundingSource({
      id: "i",
      companyName: "",
      productName: "Kit",
      description: "Meal kits.",
      features: ["Fast"],
      referenceCustomers: [],
      createdAt: "now",
    });
    assert.equal(text, "Kit\nMeal kits.\nFast");
  });
});

describe("coverageOf", () => {
  it("counts each basis and treats a missing field as a gap", () => {
    const g = (basis: "stated" | "derived" | "assumed" | "unknown") => ({
      grounding: { basis, quotes: [] },
    });
    const c = coverageOf(
      {
        industries: g("stated"),
        headcountRange: g("derived"),
        revenueBand: g("assumed"),
        geographies: g("unknown"),
      },
      B2B_CHECKLIST,
    );
    assert.deepEqual(
      { s: c.supported, b: c.bestGuesses, g: c.gaps, t: c.total },
      { s: 2, b: 1, g: 5, t: 8 },
    );
  });
});

describe("actionableIcp", () => {
  const field = <T,>(value: T, basis?: "stated" | "assumed" | "unknown") => ({
    value,
    confidence: 0.5,
    rationale: "",
    evidence: [],
    ...(basis ? { grounding: { basis, quotes: [] } } : {}),
  });
  const icp = (basis?: "stated" | "assumed" | "unknown") =>
    ({
      id: "x",
      intakeId: "y",
      industries: field([{ name: "Food", naics: "311999" }], "stated"),
      headcountRange: field({ min: 1, max: 5, tierLabel: "Tiny" }, basis),
      revenueBand: field({ min: 1, max: 2, currency: "USD" }, basis),
      geographies: field(["United States"], basis),
      personas: field([], basis),
      triggerEvents: field([], basis),
      negativeSignals: field(["Hiring freeze"], basis),
      techStackAffinity: field(["Shopify"], basis),
      overallConfidence: 0.5,
      status: "draft",
      createdAt: "now",
    }) as never;

  it("removes best guesses from decisions without touching the original", () => {
    const source = icp("assumed") as { negativeSignals: { value: string[] } };
    const out = actionableIcp(source as never);
    assert.deepEqual(out.negativeSignals.value, []);
    assert.deepEqual(out.geographies.value, []);
    assert.equal(out.headcountRange.value.max, 0);
    assert.deepEqual(source.negativeSignals.value, ["Hiring freeze"]);
  });

  it("keeps supported fields", () => {
    assert.equal(actionableIcp(icp("assumed")).industries.value.length, 1);
  });

  it("leaves a profile without grounding records unchanged", () => {
    assert.deepEqual(actionableIcp(icp()).negativeSignals.value, ["Hiring freeze"]);
  });
});

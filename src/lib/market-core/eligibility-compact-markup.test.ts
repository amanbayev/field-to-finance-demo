import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EligibilityRowExplanation } from "@/components/market-core/instrument-eligibility-table";
import { DeskRow } from "@/components/surface/desk-stage";
import { WHEAT_INSTRUMENT_ID } from "@/data/market-core/catalog";
import { listInstrumentEligibilityReadModel } from "@/services/market-core-service";
import { presentEligibilityExplanation } from "./eligibility-presentation";

function passthroughTranslate(key: string): string {
  return key;
}

function tagContainsInnerTag(html: string, outer: string, inner: string): boolean {
  const pattern = new RegExp(`<${outer}\\b[^>]*>[\\s\\S]*?</${outer}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[0].includes(`<${inner}`)) {
      return true;
    }
  }
  return false;
}

function renderCompactRow(
  row: ReturnType<typeof listInstrumentEligibilityReadModel>[number],
  extra: { href?: string } = {},
): string {
  const presented = presentEligibilityExplanation(row.explanation);
  return renderToStaticMarkup(
    createElement(
      "ul",
      null,
      createElement(DeskRow, {
        title: row.instrumentSymbol ?? row.instrumentId,
        hint: "inline hint",
        href: extra.href,
        block: createElement(EligibilityRowExplanation, {
          row,
          presented,
          t: passthroughTranslate as never,
          locale: "en",
        }),
      }),
    ),
  );
}

describe("compact eligibility markup", () => {
  const rows = listInstrumentEligibilityReadModel();
  const assessed = rows.find(
    (row) =>
      row.participantReference === "INVESTOR-0001" && row.instrumentId === WHEAT_INSTRUMENT_ID,
  )!;
  const unassessed = rows.find(
    (row) =>
      row.participantReference === "COMMODITY-DESK" && row.instrumentId === WHEAT_INSTRUMENT_ID,
  )!;

  it("keeps block explanation outside the hint paragraph", () => {
    const html = renderCompactRow(assessed);
    expect(html).toContain("inline hint");
    expect(html).toMatch(
      /<p class="mt-1 max-w-2xl text-sm text-straw">inline hint<\/p>/,
    );
    expect(html).toContain("<details>");
    expect(html).toContain("assessmentDetails");
    expect(html).toContain("<ul");
    expect(tagContainsInnerTag(html, "p", "div")).toBe(false);
    expect(tagContainsInnerTag(html, "p", "details")).toBe(false);
    expect(tagContainsInnerTag(html, "p", "ul")).toBe(false);
  });

  it("does not nest interactive details inside an anchor when the heading is linked", () => {
    const html = renderCompactRow(assessed, { href: "/instruments/WHEAT-2027" });
    expect(html).toContain("<details>");
    expect(tagContainsInnerTag(html, "a", "details")).toBe(false);
  });

  it("renders assessed disclosure and unassessed compact rows", () => {
    const assessedHtml = renderCompactRow(assessed);
    const unassessedHtml = renderCompactRow(unassessed);
    expect(assessedHtml).toContain("<details>");
    expect(unassessedHtml).not.toContain("<details>");
    expect(unassessedHtml).toContain("noAssessmentRecorded");
    expect(unassessedHtml).toContain("inline hint");
    expect(tagContainsInnerTag(unassessedHtml, "p", "div")).toBe(false);
  });
});

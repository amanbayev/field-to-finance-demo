import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./page-section";

describe("EmptyState illustration", () => {
  it("renders the silo photograph by default", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, null, "No records in this ledger."),
    );
    expect(html).toContain("empty-silo-light.png");
    expect(html).toContain("No records in this ledger.");
  });

  it("omits the silo when illustration is none", () => {
    const html = renderToStaticMarkup(
      createElement(
        EmptyState,
        { illustration: "none" },
        "This instrument is not offered",
      ),
    );
    expect(html).not.toContain("empty-silo-light.png");
    expect(html).toContain("This instrument is not offered");
  });
});

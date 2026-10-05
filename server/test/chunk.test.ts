import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "../src/chunk.ts";

describe("chunkMarkdown", () => {
    it("splits at headings and keeps the heading path", () => {
        const chunks = chunkMarkdown("Handbook", "# Handbook\n\nIntro.\n\n## Expenses\n\nSubmit receipts.\n\n### Travel\n\nBook through Navan.\n\n## Leave\n\n25 days.");
        expect(chunks).toEqual([
            { heading: "Handbook", body: "Intro." },
            { heading: "Handbook › Expenses", body: "Submit receipts." },
            { heading: "Handbook › Expenses › Travel", body: "Book through Navan." },
            { heading: "Handbook › Leave", body: "25 days." },
        ]);
    });

    it("handles documents that start below the top heading level", () => {
        expect(chunkMarkdown("VPN", "## macOS\n\nInstall WireGuard.")).toEqual([{ heading: "VPN › macOS", body: "Install WireGuard." }]);
    });

    it("packs paragraphs up to the size limit and splits oversized ones", () => {
        const chunks = chunkMarkdown("Doc", ["a".repeat(300), "b".repeat(300), "c".repeat(300), "d".repeat(1_000)].join("\n\n"), 700);
        expect(chunks.map((c) => c.body.length)).toEqual([602, 300, 700, 300]);
    });
});

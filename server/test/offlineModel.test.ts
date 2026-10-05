import { describe, expect, it } from "vitest";
import { OfflineModel } from "../src/offlineModel.ts";

describe("OfflineModel", () => {
    it("plans by keeping keywords and answers by quoting the best sentence", async () => {
        const model = new OfflineModel();
        expect(await model.complete([{ role: "system", content: "Rewrite…" }, { role: "user", content: "How do I set up the VPN?" }])).toBe("set up vpn");
        const sources = "Sources:\n\n[1] Leave\nYou get 25 days.\n\n[2] VPN\nIt is fast. Install WireGuard to set up the VPN.\n\nQuestion: How do I set up the VPN?";
        expect(await model.complete([{ role: "system", content: "Answer…" }, { role: "user", content: sources }])).toBe("Install WireGuard to set up the VPN. [2]");
    });
});

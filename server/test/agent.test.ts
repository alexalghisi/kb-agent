import { describe, expect, it } from "vitest";
import { citedNumbers, createAgent } from "../src/agent.ts";
import type { ChatModel, Message } from "../src/model.ts";
import type { Hit } from "../src/search.ts";

const hit = (chunkId: number, title: string, body: string, rank = 1): Hit => ({ chunkId, sourceId: "wiki", title, url: `https://kb/${chunkId}`, heading: title, body, rank });

const KB: Record<string, Hit[]> = {
    "vpn mac": [hit(1, "VPN setup › macOS", "Install the WireGuard client and import your profile.", 0.9)],
    wireguard: [hit(1, "VPN setup › macOS", "Install the WireGuard client and import your profile.", 0.9), hit(2, "IT › Laptops", "Laptops ship with WireGuard preinstalled.", 0.4)],
};
const search = async (q: string) => KB[q] ?? [];

class Scripted implements ChatModel {
    readonly prompts: Message[][] = [];
    readonly replies: string[];
    constructor(...replies: string[]) {
        this.replies = replies;
    }
    async complete(messages: readonly Message[]): Promise<string> {
        this.prompts.push([...messages]);
        const reply = this.replies.shift();
        if (reply === undefined) throw new Error("no scripted reply left");
        return reply;
    }
}

describe("agent", () => {
    it("plans queries, merges hits and answers with citations", async () => {
        const model = new Scripted("vpn mac\nwireguard", "Install WireGuard and import your profile [1]. New laptops already have it [2].");
        const result = await createAgent(model, search)("How do I set up the VPN on my Mac?");
        expect(result).toEqual({
            answer: "Install WireGuard and import your profile [1]. New laptops already have it [2].",
            citations: [
                { n: 1, title: "VPN setup › macOS", heading: "VPN setup › macOS", url: "https://kb/1" },
                { n: 2, title: "IT › Laptops", heading: "IT › Laptops", url: "https://kb/2" },
            ],
            grounded: true,
            trace: ["plan", "retrieve:2", "respond", "verify:ok"],
        });
        expect(model.prompts[1]?.[1]?.content).toContain("[1] VPN setup › macOS\nInstall the WireGuard client");
    });

    it("sends an answer back once when it cites sources it wasn't given", async () => {
        const model = new Scripted("wireguard", "Use WireGuard [3].", "Use WireGuard [1].");
        const result = await createAgent(model, search)("Which VPN client?");
        expect(result.trace).toEqual(["plan", "retrieve:2", "respond", "verify:bad-citations", "respond", "verify:ok"]);
        expect(model.prompts[2]?.[1]?.content).toContain("Fix this: there are no sources [3]; cite only [1]-[2]");
        expect(result.grounded).toBe(true);
    });

    it("marks answers that stay ungrounded and strips citations to nothing", async () => {
        const model = new Scripted("wireguard", "Use WireGuard [7].", "Use WireGuard, trust me.");
        const result = await createAgent(model, search)("Which VPN client?");
        expect(result).toMatchObject({ answer: "Use WireGuard, trust me.", citations: [], grounded: false });
    });

    it("says so when nothing relevant is found, without asking the model to answer", async () => {
        const model = new Scripted("parental leave");
        const result = await createAgent(model, search)("How long is parental leave?");
        expect(result).toEqual({ answer: "I couldn't find this in your knowledge base.", citations: [], grounded: false, trace: ["plan", "retrieve:0"] });
        expect(model.prompts).toHaveLength(1);
    });

    it("reads citation markers", () => {
        expect(citedNumbers("a [1] b [2][1] c [x]")).toEqual([1, 2]);
    });
});

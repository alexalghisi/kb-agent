import type { ChatModel, Message } from "./model.ts";

const STOPWORDS = new Set("a an the is are do does how i my me to of in on for with what which where when who can should we our you your it if from won wont not at be get much many".split(" "));

/**
 * A deterministic stand-in so the demo and the console run without an API key. It plans by keeping keywords
 * and "answers" by quoting the best source sentence with its citation. It is not a language model.
 */
export class OfflineModel implements ChatModel {
    async complete(messages: readonly Message[]): Promise<string> {
        const system = messages[0]?.content ?? "";
        const user = messages[messages.length - 1]?.content ?? "";
        if (system.startsWith("Rewrite")) {
            return user
                .toLowerCase()
                .split(/[^\p{L}\p{N}]+/u)
                .filter((w) => w.length > 1 && !STOPWORDS.has(w))
                .join(" ");
        }
        const question = /Question: (.+)/.exec(user)?.[1] ?? "";
        const terms = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOPWORDS.has(w));
        let best: { n: number; sentence: string; score: number } | null = null;
        for (const match of user.matchAll(/\[(\d+)\] ([^\n]*)\n([\s\S]*?)(?=\n\n\[\d+\]|\n\nQuestion:)/g)) {
            const heading = (match[2] ?? "").toLowerCase();
            for (const sentence of (match[3] ?? "").split(/(?<=[.!?])\s+/)) {
                // The section heading counts too: "VPN setup › macOS" tells you what the sentence is about.
                const score = terms.filter((t) => `${heading} ${sentence.toLowerCase()}`.includes(t)).length;
                if (score > 0 && (best === null || score > best.score)) best = { n: Number(match[1]), sentence: sentence.trim(), score };
            }
        }
        // Only answer when a sentence covers at least half of the question's keywords.
        return best && best.score * 2 >= terms.length ? `${best.sentence} [${best.n}]` : "I couldn't find this in your knowledge base.";
    }
}

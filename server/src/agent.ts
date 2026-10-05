import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ChatModel } from "./model.ts";
import type { Hit } from "./search.ts";

export type Search = (query: string) => Promise<Hit[]>;

export interface Citation {
    readonly n: number;
    readonly title: string;
    readonly heading: string;
    readonly url: string;
}

export interface AgentAnswer {
    readonly answer: string;
    readonly citations: Citation[];
    /** False when the answer couldn't be tied to the knowledge base. */
    readonly grounded: boolean;
    readonly trace: string[];
}

const NOT_FOUND = "I couldn't find this in your knowledge base.";
const MAX_SOURCES = 6;
const MAX_ANSWER_ATTEMPTS = 2;

const State = Annotation.Root({
    question: Annotation<string>(),
    queries: Annotation<string[]>({ reducer: (_old, next) => next, default: () => [] }),
    hits: Annotation<Hit[]>({ reducer: (_old, next) => next, default: () => [] }),
    answer: Annotation<string>({ reducer: (_old, next) => next, default: () => "" }),
    feedback: Annotation<string | null>({ reducer: (_old, next) => next, default: () => null }),
    attempts: Annotation<number>({ reducer: (_old, next) => next, default: () => 0 }),
    trace: Annotation<string[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
});

type S = typeof State.State;

export function citedNumbers(answer: string): number[] {
    return [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
}

/**
 * plan → retrieve → respond → verify, as a LangGraph state machine.
 * The model rewrites the question into search queries, answers only from numbered sources, and the
 * verify step checks every [n] it cites. An answer citing sources it wasn't given, or none at all,
 * is sent back once with feedback; if it still fails, it is returned marked as not grounded.
 */
export function createAgent(model: ChatModel, search: Search) {
    async function plan(state: S): Promise<Partial<S>> {
        const reply = await model.complete([
            {
                role: "system",
                content:
                    "Rewrite the user's question into 1-3 short keyword search queries for a company knowledge base. " +
                    "Return one query per line, nothing else.",
            },
            { role: "user", content: state.question },
        ]);
        const queries = reply
            .split("\n")
            .map((q) => q.replace(/^[-*\d.\s]+/, "").trim())
            .filter(Boolean)
            .slice(0, 3);
        return { queries: queries.length > 0 ? queries : [state.question], trace: ["plan"] };
    }

    async function retrieve(state: S): Promise<Partial<S>> {
        const seen = new Map<number, Hit>();
        for (const query of state.queries) for (const hit of await search(query)) if (!seen.has(hit.chunkId)) seen.set(hit.chunkId, hit);
        const hits = [...seen.values()].sort((a, b) => b.rank - a.rank).slice(0, MAX_SOURCES);
        return { hits, trace: [`retrieve:${hits.length}`] };
    }

    async function respond(state: S): Promise<Partial<S>> {
        const sources = state.hits.map((h, i) => `[${i + 1}] ${h.heading}\n${h.body}`).join("\n\n");
        const reply = await model.complete([
            {
                role: "system",
                content:
                    "Answer using only the numbered sources. Cite every claim with its source number like [2]. " +
                    `If the sources don't contain the answer, reply exactly: ${NOT_FOUND}`,
            },
            { role: "user", content: `Sources:\n\n${sources}\n\nQuestion: ${state.question}${state.feedback ? `\n\nFix this: ${state.feedback}` : ""}` },
        ]);
        return { answer: reply.trim(), attempts: state.attempts + 1, trace: ["respond"] };
    }

    function verify(state: S): Partial<S> {
        if (state.answer === NOT_FOUND) return { feedback: null, trace: ["verify:not-found"] };
        const cited = citedNumbers(state.answer);
        const unknown = cited.filter((n) => n < 1 || n > state.hits.length);
        if (cited.length === 0) return { feedback: "the answer has no citations; cite the sources you used like [1]", trace: ["verify:uncited"] };
        if (unknown.length > 0) return { feedback: `there are no sources ${unknown.map((n) => `[${n}]`).join(", ")}; cite only [1]-[${state.hits.length}]`, trace: ["verify:bad-citations"] };
        return { feedback: null, trace: ["verify:ok"] };
    }

    const graph = new StateGraph(State)
        .addNode("plan", plan)
        .addNode("retrieve", retrieve)
        .addNode("respond", respond)
        .addNode("verify", verify)
        .addEdge(START, "plan")
        .addEdge("plan", "retrieve")
        .addConditionalEdges("retrieve", (s: S) => (s.hits.length > 0 ? "respond" : END), ["respond", END])
        .addEdge("respond", "verify")
        .addConditionalEdges("verify", (s: S) => (s.feedback !== null && s.attempts < MAX_ANSWER_ATTEMPTS ? "respond" : END), ["respond", END])
        .compile();

    return async function ask(question: string): Promise<AgentAnswer> {
        const final = (await graph.invoke({ question })) as S;
        if (final.hits.length === 0) return { answer: NOT_FOUND, citations: [], grounded: false, trace: final.trace };
        const valid = citedNumbers(final.answer).filter((n) => n >= 1 && n <= final.hits.length);
        const citations = valid.map((n) => {
            const hit = final.hits[n - 1] as Hit;
            return { n, title: hit.title, heading: hit.heading, url: hit.url };
        });
        const grounded = final.feedback === null && final.answer !== NOT_FOUND;
        // Invalid markers are removed rather than shown as links to nothing.
        const answerText = final.answer.replace(/\[(\d+)\]/g, (marker, n: string) => (valid.includes(Number(n)) ? marker : ""));
        return { answer: answerText, citations, grounded, trace: final.trace };
    }
}

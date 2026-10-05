import type { Descendant } from "slate";
import type { AgentApi } from "./api";
import { KnowledgeEditor } from "./editor/KnowledgeEditor";

export const STARTER: Descendant[] = [
    { type: "heading-one", children: [{ text: "Team notes" }] },
    { type: "paragraph", children: [{ text: "Write here. Type /ask and a question, then press Enter, to get an answer from the handbook with its sources." }] },
    { type: "callout", children: [{ text: "Shortcuts: '# ' heading, '## ' subheading, '> ' callout." }] },
    { type: "paragraph", children: [{ text: "" }] },
];

export function App({ api }: { readonly api: AgentApi }) {
    return (
        <main className="page">
            <KnowledgeEditor api={api} initialValue={STARTER} />
        </main>
    );
}

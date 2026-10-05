import { Editor, Element, Node, Path, Transforms } from "slate";
import type { AgentApi } from "../api";
import type { AgentAnswerElement, AnswerState, CustomElement } from "./types";

const SHORTCUTS: Record<string, CustomElement["type"]> = { "#": "heading-one", "##": "heading-two", ">": "callout" };

/** Markdown-style shortcuts: typing "# ", "## " or "> " at the start of a paragraph turns it into that block. */
export function withShortcuts(editor: Editor): Editor {
    const { insertText, insertBreak, isVoid } = editor;
    editor.isVoid = (element) => element.type === "agent-answer" || isVoid(element);
    // Pressing Enter at the end of a heading or callout continues with a normal paragraph, like any editor.
    editor.insertBreak = () => {
        const block = Editor.above<CustomElement>(editor, { match: (n) => Element.isElement(n) && Editor.isBlock(editor, n) });
        insertBreak();
        if (block && block[0].type !== "paragraph" && editor.selection) {
            const current = Editor.above<CustomElement>(editor, { match: (n) => Element.isElement(n) && Editor.isBlock(editor, n) });
            if (current && Editor.isEmpty(editor, current[0])) Transforms.setNodes(editor, { type: "paragraph" }, { at: current[1] });
        }
    };
    editor.insertText = (text) => {
        const { selection } = editor;
        if (text === " " && selection && selection.anchor.offset === selection.focus.offset) {
            const block = Editor.above<CustomElement>(editor, { match: (n) => Element.isElement(n) && Editor.isBlock(editor, n) });
            if (block && block[0].type === "paragraph") {
                const before = Editor.string(editor, { anchor: Editor.start(editor, block[1]), focus: selection.anchor });
                const type = SHORTCUTS[before];
                if (type) {
                    Transforms.delete(editor, { at: { anchor: Editor.start(editor, block[1]), focus: selection.anchor } });
                    Transforms.setNodes(editor, { type }, { at: block[1] });
                    return;
                }
            }
        }
        insertText(text);
    };
    return editor;
}

/** "/ask how do I…" → "how do I…"; anything else → null. */
export function parseAskCommand(text: string): string | null {
    const match = /^\/ask\s+(.{3,500})$/s.exec(text.trim());
    return match?.[1]?.trim() ?? null;
}

export function findAnswer(editor: Editor, id: string): Path | null {
    for (const [node, path] of Node.nodes(editor)) {
        if (Element.isElement(node) && node.type === "agent-answer" && node.id === id) return path;
    }
    return null;
}

/** Replaces the block at `at` with a pending answer block and a fresh paragraph after it. */
export function insertPendingAnswer(editor: Editor, at: Path, question: string, id: string): void {
    Editor.withoutNormalizing(editor, () => {
        Transforms.removeNodes(editor, { at });
        const block: AgentAnswerElement = { type: "agent-answer", id, question, state: { status: "pending" }, children: [{ text: "" }] };
        Transforms.insertNodes(editor, [block, { type: "paragraph", children: [{ text: "" }] }], { at });
    });
    Transforms.select(editor, Editor.start(editor, Path.next(at)));
}

/** Updates the answer block wherever it is now; the document may have changed while the agent was thinking. */
export function setAnswerState(editor: Editor, id: string, state: AnswerState): boolean {
    const path = findAnswer(editor, id);
    if (path === null) return false; // the user deleted the block: drop the late answer
    Transforms.setNodes(editor, { state } as Partial<AgentAnswerElement>, { at: path });
    return true;
}

let counter = 0;
export const newAnswerId = () => `answer-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** If the current paragraph is an /ask command, turns it into an answer block and fills it in when the agent replies. */
export function runAskCommand(editor: Editor, api: AgentApi, id = newAnswerId()): Promise<void> | null {
    const block = Editor.above(editor, { match: (n) => Element.isElement(n) && n.type === "paragraph" });
    if (!block) return null;
    const question = parseAskCommand(Node.string(block[0]));
    if (question === null) return null;
    insertPendingAnswer(editor, block[1], question, id);
    return ask(editor, api, id, question);
}

export async function ask(editor: Editor, api: AgentApi, id: string, question: string): Promise<void> {
    setAnswerState(editor, id, { status: "pending" });
    try {
        const result = await api.ask(question);
        setAnswerState(editor, id, { status: "done", result });
    } catch (error) {
        setAnswerState(editor, id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
}

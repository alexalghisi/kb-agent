import { createEditor, Editor, Transforms, type Descendant } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import type { AgentApi } from "../api";
import { parseAskCommand, runAskCommand, setAnswerState, withShortcuts } from "./commands";

function editorWith(children: Descendant[]): Editor {
    const editor = withShortcuts(withHistory(withReact(createEditor())));
    editor.children = children;
    Transforms.select(editor, Editor.end(editor, []));
    return editor;
}

const p = (text: string): Descendant => ({ type: "paragraph", children: [{ text }] });
const answer = { answer: "Install WireGuard [1].", citations: [{ n: 1, title: "VPN", heading: "VPN setup › macOS", url: "https://kb/vpn" }], grounded: true };

describe("parseAskCommand", () => {
    it("extracts the question", () => {
        expect(parseAskCommand("/ask  How do I set up the VPN? ")).toBe("How do I set up the VPN?");
        expect(parseAskCommand("/ask hi")).toBeNull();
        expect(parseAskCommand("please /ask something")).toBeNull();
    });
});

describe("shortcuts", () => {
    it("turns '# ' and '> ' into blocks", () => {
        const editor = editorWith([p("#")]);
        editor.insertText(" ");
        expect(editor.children[0]).toEqual({ type: "heading-one", children: [{ text: "" }] });
        const callout = editorWith([p(">")]);
        callout.insertText(" ");
        expect(callout.children[0]).toMatchObject({ type: "callout" });
        const normal = editorWith([p("x#")]);
        normal.insertText(" ");
        expect(normal.children[0]).toEqual(p("x# "));
    });
});

describe("line breaks", () => {
    it("continue with a paragraph after a heading", () => {
        const editor = editorWith([{ type: "heading-two", children: [{ text: "Questions" }] }]);
        editor.insertBreak();
        expect(editor.children[1]).toEqual(p(""));
    });

    it("split a heading in the middle without changing either half", () => {
        const editor = editorWith([{ type: "heading-two", children: [{ text: "AB" }] }]);
        Transforms.select(editor, { path: [0, 0], offset: 1 });
        editor.insertBreak();
        expect(editor.children).toEqual([
            { type: "heading-two", children: [{ text: "A" }] },
            { type: "heading-two", children: [{ text: "B" }] },
        ]);
    });
});

describe("runAskCommand", () => {
    it("replaces the command with a pending answer, then fills it in", async () => {
        let resolve!: (value: typeof answer) => void;
        const api: AgentApi = { ask: () => new Promise((r) => (resolve = r)) };
        const editor = editorWith([p("Notes"), p("/ask How do I set up the VPN?")]);
        const done = runAskCommand(editor, api, "a1");
        expect(editor.children[1]).toMatchObject({ type: "agent-answer", id: "a1", question: "How do I set up the VPN?", state: { status: "pending" } });
        expect(editor.children[2]).toEqual(p(""));
        expect(editor.selection?.anchor.path).toEqual([2, 0]);
        resolve(answer);
        await done;
        expect(editor.children[1]).toMatchObject({ state: { status: "done", result: answer } });
    });

    it("records failures on the block", async () => {
        const editor = editorWith([p("/ask anything at all?")]);
        await runAskCommand(editor, { ask: () => Promise.reject(new Error("The agent couldn't answer (503)")) }, "a2");
        expect(editor.children[0]).toMatchObject({ state: { status: "failed", error: "The agent couldn't answer (503)" } });
    });

    it("ignores ordinary paragraphs", () => {
        expect(runAskCommand(editorWith([p("just text")]), { ask: () => Promise.reject() })).toBeNull();
    });

    it("drops a late answer if the block was deleted meanwhile", () => {
        const editor = editorWith([p("x")]);
        expect(setAnswerState(editor, "gone", { status: "pending" })).toBe(false);
    });
});

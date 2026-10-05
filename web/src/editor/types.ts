import type { BaseEditor } from "slate";
import type { HistoryEditor } from "slate-history";
import type { ReactEditor } from "slate-react";
import type { AgentAnswer } from "../api";

export type Text = { text: string; bold?: boolean; code?: boolean };

export type AnswerState =
    | { readonly status: "pending" }
    | { readonly status: "done"; readonly result: AgentAnswer }
    | { readonly status: "failed"; readonly error: string };

export type ParagraphElement = { type: "paragraph"; children: Text[] };
export type HeadingElement = { type: "heading-one" | "heading-two"; children: Text[] };
export type CalloutElement = { type: "callout"; children: Text[] };
/** A void block: its content is the agent's answer, not editable text. */
export type AgentAnswerElement = { type: "agent-answer"; id: string; question: string; state: AnswerState; children: [{ text: "" }] };

export type CustomElement = ParagraphElement | HeadingElement | CalloutElement | AgentAnswerElement;

declare module "slate" {
    interface CustomTypes {
        Editor: BaseEditor & ReactEditor & HistoryEditor;
        Element: CustomElement;
        Text: Text;
    }
}

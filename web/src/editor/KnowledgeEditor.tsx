import { useCallback, useMemo, type KeyboardEvent } from "react";
import { createEditor, type Descendant } from "slate";
import { withHistory } from "slate-history";
import { Editable, Slate, withReact, type RenderElementProps } from "slate-react";
import type { AgentApi } from "../api";
import { AnswerBlock } from "./AnswerBlock";
import { ask, runAskCommand, withShortcuts } from "./commands";
import "./types";

interface KnowledgeEditorProps {
    readonly api: AgentApi;
    readonly initialValue: Descendant[];
    readonly onChange?: (value: Descendant[]) => void;
}

export function KnowledgeEditor({ api, initialValue, onChange }: KnowledgeEditorProps) {
    const editor = useMemo(() => withShortcuts(withHistory(withReact(createEditor()))), []);

    const renderElement = useCallback(
        ({ attributes, children, element }: RenderElementProps) => {
            switch (element.type) {
                case "heading-one":
                    return <h1 {...attributes}>{children}</h1>;
                case "heading-two":
                    return <h2 {...attributes}>{children}</h2>;
                case "callout":
                    return (
                        <aside className="callout" {...attributes}>
                            {children}
                        </aside>
                    );
                case "agent-answer":
                    return (
                        <div {...attributes} contentEditable={false}>
                            <AnswerBlock element={element} onRetry={() => void ask(editor, api, element.id, element.question)} />
                            {children}
                        </div>
                    );
                default:
                    return <p {...attributes}>{children}</p>;
            }
        },
        [editor, api],
    );

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" && !event.shiftKey && runAskCommand(editor, api) !== null) event.preventDefault();
    };

    return (
        <Slate editor={editor} initialValue={initialValue} {...(onChange ? { onChange } : {})}>
            <Editable className="editable" renderElement={renderElement} onKeyDown={onKeyDown} placeholder="Write, or type /ask and a question…" />
        </Slate>
    );
}

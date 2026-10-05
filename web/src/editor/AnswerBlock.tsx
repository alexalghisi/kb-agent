import { Fragment } from "react";
import { NOT_FOUND } from "../api";
import type { AgentAnswerElement } from "./types";

interface AnswerBlockProps {
    readonly element: AgentAnswerElement;
    readonly onRetry?: () => void;
}

/** Renders "… [2] …" with citation chips that link to the sources listed underneath. */
function withCitations(text: string, id: string) {
    return text.split(/(\[\d+\])/g).map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return <Fragment key={i}>{part}</Fragment>;
        return (
            <a key={i} className="cite" href={`#${id}-source-${match[1]}`} aria-label={`source ${match[1]}`}>
                {match[1]}
            </a>
        );
    });
}

export function AnswerBlock({ element, onRetry }: AnswerBlockProps) {
    const { state, question, id } = element;
    return (
        <figure className={`answer answer-${state.status}`} aria-busy={state.status === "pending"}>
            <figcaption className="question">
                <span className="badge">Agent</span> {question}
            </figcaption>
            {state.status === "pending" && <p className="muted">Searching your knowledge base…</p>}
            {state.status === "failed" && (
                <p role="alert" className="error">
                    {state.error}{" "}
                    {onRetry && (
                        <button type="button" onClick={onRetry}>
                            Try again
                        </button>
                    )}
                </p>
            )}
            {state.status === "done" && (
                <>
                    {state.result.answer === NOT_FOUND ? (
                        <p className="muted">{NOT_FOUND} Try other words, or add the answer to the handbook.</p>
                    ) : (
                        <>
                            {!state.result.grounded && <p className="warning">Not backed by your documents. Double-check before relying on it.</p>}
                            <p className="text">{withCitations(state.result.answer, id)}</p>
                        </>
                    )}
                    {state.result.citations.length > 0 && (
                        <ol className="sources">
                            {state.result.citations.map((c) => (
                                <li key={c.n} id={`${id}-source-${c.n}`} value={c.n}>
                                    <a href={c.url} target="_blank" rel="noopener noreferrer">
                                        {c.heading}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    )}
                </>
            )}
        </figure>
    );
}

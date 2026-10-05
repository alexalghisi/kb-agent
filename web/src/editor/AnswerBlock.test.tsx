import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerBlock } from "./AnswerBlock";
import type { AgentAnswerElement, AnswerState } from "./types";

const block = (state: AnswerState): AgentAnswerElement => ({ type: "agent-answer", id: "a1", question: "How do I set up the VPN?", state, children: [{ text: "" }] });

describe("AnswerBlock", () => {
    it("links citation markers to their sources", () => {
        render(
            <AnswerBlock
                element={block({
                    status: "done",
                    result: { answer: "Install WireGuard [1] and import the profile [2].", grounded: true, citations: [
                        { n: 1, title: "VPN", heading: "VPN setup › macOS", url: "https://kb/vpn" },
                        { n: 2, title: "IT", heading: "IT › First day", url: "https://kb/it" },
                    ] },
                })}
            />,
        );
        expect(screen.getByRole("link", { name: "source 2" })).toHaveAttribute("href", "#a1-source-2");
        expect(screen.getByRole("link", { name: "VPN setup › macOS" })).toHaveAttribute("href", "https://kb/vpn");
        expect(screen.queryByText(/Not backed by your documents/)).toBeNull();
    });

    it("warns when the answer isn't grounded", () => {
        render(<AnswerBlock element={block({ status: "done", result: { answer: "I couldn't find this in your knowledge base.", citations: [], grounded: false } })} />);
        expect(screen.getByText(/Not backed by your documents/)).toBeInTheDocument();
    });

    it("shows progress and lets you retry failures", async () => {
        const { rerender } = render(<AnswerBlock element={block({ status: "pending" })} />);
        expect(screen.getByRole("figure")).toHaveAttribute("aria-busy", "true");
        const onRetry = vi.fn();
        rerender(<AnswerBlock element={block({ status: "failed", error: "The agent couldn't answer (503)" })} onRetry={onRetry} />);
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalled();
    });
});

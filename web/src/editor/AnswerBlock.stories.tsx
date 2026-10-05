import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnswerBlock } from "./AnswerBlock";
import type { AgentAnswerElement, AnswerState } from "./types";

const element = (state: AnswerState): AgentAnswerElement => ({
    type: "agent-answer",
    id: "story",
    question: "How do I set up the VPN on my Mac?",
    state,
    children: [{ text: "" }],
});

const meta: Meta<typeof AnswerBlock> = { title: "Editor/AnswerBlock", component: AnswerBlock };
export default meta;
type Story = StoryObj<typeof AnswerBlock>;

export const Pending: Story = { args: { element: element({ status: "pending" }) } };

export const Answered: Story = {
    args: {
        element: element({
            status: "done",
            result: {
                answer: "Install the WireGuard client from Self Service, then import the profile IT emails you on your first day [1]. If a hotel network blocks it, use your phone's hotspot [2].",
                grounded: true,
                citations: [
                    { n: 1, title: "VPN setup", heading: "VPN setup › macOS", url: "https://handbook.example/vpn.md" },
                    { n: 2, title: "VPN setup", heading: "VPN setup › Travelling", url: "https://handbook.example/vpn.md" },
                ],
            },
        }),
    },
};

export const NotGrounded: Story = {
    args: { element: element({ status: "done", result: { answer: "I couldn't find this in your knowledge base.", citations: [], grounded: false } }) },
};

export const Failed: Story = {
    args: { element: element({ status: "failed", error: "The agent couldn't answer (503)" }), onRetry: () => {} },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AgentApi } from "../api";
import { STARTER } from "../App";
import { KnowledgeEditor } from "./KnowledgeEditor";

/** Answers after a short delay with fixed data, so the editor can be tried without a backend. */
const mockApi: AgentApi = {
    ask: (question) =>
        new Promise((resolve) =>
            setTimeout(
                () =>
                    resolve({
                        answer: `Here is what the handbook says about “${question}”: book leave in Factorial at least two weeks ahead [1].`,
                        grounded: true,
                        citations: [{ n: 1, title: "Leave and holidays", heading: "Leave and holidays › Booking leave", url: "https://handbook.example/leave.md" }],
                    }),
                800,
            ),
        ),
};

const meta: Meta<typeof KnowledgeEditor> = { title: "Editor/KnowledgeEditor", component: KnowledgeEditor };
export default meta;

export const WithMockAgent: StoryObj<typeof KnowledgeEditor> = { args: { api: mockApi, initialValue: STARTER } };

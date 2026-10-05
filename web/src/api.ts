export interface Citation {
    readonly n: number;
    readonly title: string;
    readonly heading: string;
    readonly url: string;
}

export interface AgentAnswer {
    readonly answer: string;
    readonly citations: readonly Citation[];
    readonly grounded: boolean;
}

export interface AgentApi {
    ask(question: string, signal?: AbortSignal): Promise<AgentAnswer>;
}

export function httpApi(baseUrl: string): AgentApi {
    return {
        async ask(question, signal) {
            const response = await fetch(`${baseUrl}/ask`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ question }),
                ...(signal ? { signal } : {}),
            });
            if (!response.ok) throw new Error(`The agent couldn't answer (${response.status})`);
            return (await response.json()) as AgentAnswer;
        },
    };
}

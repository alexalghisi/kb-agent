export interface Message {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
}

/** The agent only needs text in, text out; tests use a scripted model, production an OpenAI-compatible API. */
export interface ChatModel {
    complete(messages: readonly Message[], signal?: AbortSignal): Promise<string>;
}

export class OpenAIChatModel implements ChatModel {
    readonly #apiKey: string;
    readonly #model: string;
    readonly #baseUrl: string;

    constructor(apiKey: string, model = "gpt-4o-mini", baseUrl = "https://api.openai.com/v1") {
        this.#apiKey = apiKey;
        this.#model = model;
        this.#baseUrl = baseUrl;
    }

    async complete(messages: readonly Message[], signal?: AbortSignal): Promise<string> {
        const response = await fetch(`${this.#baseUrl}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({ model: this.#model, temperature: 0, messages }),
            ...(signal ? { signal } : {}),
        });
        if (!response.ok) throw new Error(`model API ${response.status}: ${(await response.text()).slice(0, 200)}`);
        const payload = (await response.json()) as { choices: { message: { content: string } }[] };
        return payload.choices[0]?.message.content ?? "";
    }
}

/**
 * Where the mind's model is reached — a local model at an address, or a hosted
 * one by an API key — and how a request is sent (CONTEXT.md §5a).
 *
 * The protocol is the OpenAI-compatible `/chat/completions` that llama.cpp,
 * vLLM and most hosted providers serve; a provider with an API of its own needs
 * a transport of its own (a way of sending, not a new model).
 *
 * THE KEY. `apiKeyEnv` names the environment variable that holds it, never the
 * key itself. It is read when a request is sent and goes into the request's
 * `Authorization: Bearer` header and nowhere else: not the store, not `[event]`,
 * not a snapshot, not a thought the mind writes (mind.test.ts holds it to that).
 *
 * WHY THE REQUEST RUNS IN A CHILD PROCESS (MODEL_TRANSPORT, declared). The mind
 * sits at T5's rule, and the loop runs a cycle synchronously; `fetch` is
 * asynchronous. Rather than make the loop asynchronous, the request is sent from
 * a short-lived Node process the mind waits on — the standard library only, no
 * dependency. The key reaches that process through its environment, never its
 * arguments.
 */

import { execFileSync } from "node:child_process";

export interface ModelEndpoint {
  /** The base URL: `http://127.0.0.1:8080/v1`, or a provider's. */
  readonly url: string;
  /** The model's name at that endpoint. */
  readonly model: string;
  /** The environment variable holding the API key; absent for a local model with none. */
  readonly apiKeyEnv?: string;
  /** How long to wait for an answer, in milliseconds (declared by whoever seats the mind). */
  readonly timeoutMs?: number;
  /** Anything else the model needs in the request body (sampling, a model's own switches). */
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** What came back: the text, or why there is none. */
export type ChatResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/** A way of sending: messages in, the model's text out. Synchronous (see above). */
export type ChatFn = (endpoint: ModelEndpoint, messages: readonly ChatMessage[]) => ChatResult;

/** DECIDE@IMPL — how long a request may take when the endpoint declares none. */
export const DEFAULT_TIMEOUT_MS = 120_000;

// The child: reads {url, body, timeoutMs} on stdin, the key from its environment,
// and prints {ok, text} or {ok: false, error}. Standard library only.
const CHILD = `
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
  const { url, body, timeoutMs } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const headers = { "content-type": "application/json" };
  const key = process.env.DIL_MODEL_KEY;
  if (key) headers.authorization = "Bearer " + key;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const raw = await res.text();
    if (!res.ok) { process.stdout.write(JSON.stringify({ ok: false, error: "HTTP " + res.status + ": " + raw.slice(0, 300) })); return; }
    const text = JSON.parse(raw)?.choices?.[0]?.message?.content;
    process.stdout.write(JSON.stringify(typeof text === "string" ? { ok: true, text } : { ok: false, error: "no message in the answer" }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
  }
});
`;

/** Send over `/chat/completions`, waiting on a child process. */
export const chat: ChatFn = (endpoint, messages) => {
  const timeoutMs = endpoint.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = { model: endpoint.model, messages, ...(endpoint.extra ?? {}) };
  const url = `${endpoint.url.replace(/\/+$/, "")}/chat/completions`;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DIL_MODEL_KEY;
  const key = endpoint.apiKeyEnv !== undefined ? process.env[endpoint.apiKeyEnv] : undefined;
  if (key) env.DIL_MODEL_KEY = key;
  try {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD], {
      input: JSON.stringify({ url, body, timeoutMs }),
      env,
      timeout: timeoutMs + 5_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out.toString("utf8")) as ChatResult;
  } catch (e) {
    return { ok: false, error: `transport: ${(e as Error).message.split("\n")[0]}` };
  }
};

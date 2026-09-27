/**
 * A language model as the mind's engine, reached at an endpoint — local, or
 * hosted with a key that goes into the request header and nowhere else.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { createCycle, type Layers } from "../loop/cycle.js";
import { createGlobMod } from "../loop/glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "../loop/layers/index.js";
import type { PredictRule } from "../loop/layers/t5.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import type { Signal } from "../loop/types.js";
import { createMind } from "./mind.js";
import { chat, type ChatFn, type ChatMessage } from "./endpoint.js";
import { languageModel, parseAnswer } from "./language.js";

const w = (value: unknown) => ({ entity: "weather", value });

function loop(predict: PredictRule) {
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5({ predict }), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const data = createDataStore();
  const events = createEventLog();
  let t = 0;
  const cycle = createCycle({
    layers, glob: createGlobMod({}, 0), data, events, initialEmission: { action: "boot" }, now: () => ++t,
  });
  let i = 0;
  const step = (v: unknown) =>
    cycle.run({ signals: [{ source_id: "ch", raw_payload: w(v), t: 100 + i++ } as Signal], changes: [] });
  return { step, data, events };
}

const ENDPOINT = { url: "http://127.0.0.1:1/v1", model: "local" };

function scripted(...answers: string[]): ChatFn & { prompts: ChatMessage[][] } {
  const prompts: ChatMessage[][] = [];
  const fn = ((_e, messages) => {
    prompts.push([...messages]);
    const text = answers.shift();
    return text === undefined ? { ok: false, error: "no more answers" } : { ok: true, text };
  }) as ChatFn & { prompts: ChatMessage[][] };
  fn.prompts = prompts;
  return fn;
}

test("an answer in a code fence still parses; prose does not", () => {
  assert.deepEqual(parseAnswer('```json\n{"expect": 1}\n```'), { expect: 1 });
  assert.equal(parseAnswer("I think it will rain."), undefined);
});

test("asked only when an expectation fails; what it now expects is the loop's", () => {
  const send = scripted(JSON.stringify({ expect: w("rain"), note: "it changed", ask: [], command: null }));
  const model = languageModel({ endpoint: ENDPOINT, chat: send });
  const { step } = loop(createMind(model).rule);
  step("sun");
  step("sun");
  assert.equal(send.prompts.length, 0, "nothing failed, nothing asked");
  step("rain"); // the standing expectation (sun) fails: it thinks
  assert.equal(send.prompts.length, 1);
  const shown = JSON.parse(send.prompts[0]![1]!.content);
  assert.deepEqual(shown.came_back, w("rain"));
  assert.deepEqual(shown.returned_before, [w("sun"), w("sun")]);
  assert.deepEqual(Object.keys(shown.field).sort(), ["alertness", "exploration", "trust"]);
  assert.equal(step("rain").scars, 0, "it now expects rain, and rain came");
});

test("every answer is kept whole, built from what it was shown", () => {
  const text = JSON.stringify({ expect: null, note: "n", ask: [{ kind: "thought" }], command: { go: 1 } });
  const model = languageModel({ endpoint: ENDPOINT, chat: scripted(text) });
  const { step, data, events } = loop(createMind(model).rule);
  step("sun");
  const r = step("rain");
  const thoughts = data.entries().filter(([, d]) => d.open.kind === "thought");
  assert.equal(thoughts.length, 1);
  assert.deepEqual(thoughts[0]![1].payload, { text, taken: true });
  assert.deepEqual(r.tests, [{ go: 1 }], "its command, as T5's test");
  const queries = events.all().filter((e) => e.kind === "activity" && e.activityKind === "emission");
  assert.ok(queries.some((e) => JSON.stringify(e).includes('"cue":{"kind":"thought"}')), "its question to memory");
});

test("an answer that is not JSON is kept, not taken, and the model is told next time", () => {
  const send = scripted("Probably rain.", JSON.stringify({ expect: null, ask: [], command: null }));
  const model = languageModel({ endpoint: ENDPOINT, chat: send });
  const { step, data } = loop(createMind(model).rule);
  step("sun");
  step("rain");
  step("sun");
  const kept = data.entries().filter(([, d]) => d.open.kind === "thought").map(([, d]) => d.payload);
  assert.deepEqual(kept[0], { text: "Probably rain.", taken: false });
  assert.ok(JSON.parse(send.prompts[1]![1]!.content).your_last_answer, "told why");
  assert.equal(model.notes().length, 1);
});

test("a request that fails changes nothing", () => {
  const model = languageModel({ endpoint: ENDPOINT, chat: () => ({ ok: false, error: "refused" }) });
  const { step, data } = loop(createMind(model).rule);
  step("sun");
  step("rain");
  assert.equal(data.entries().filter(([, d]) => d.open.kind === "thought").length, 0);
  assert.match(model.notes()[0]!, /refused/);
});

// ── the real transport, against a server in a process of its own ──

const SERVER = `
const http = require("node:http");
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const keyed = req.headers.authorization === "Bearer " + process.env.EXPECTED_KEY;
    const content = JSON.stringify({ expect: null, note: keyed ? "keyed" : "unkeyed", ask: [], command: null });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }], model: JSON.parse(body).model }));
  });
});
server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port) + "\\n"));
`;

test("over the real transport, the key goes in the header and nowhere else", async () => {
  const key = "test-key-7f3a9c";
  const server = spawn(process.execPath, ["-e", SERVER], { env: { ...process.env, EXPECTED_KEY: key } });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.stdout.once("data", (d: Buffer) => resolve(Number(d.toString().trim())));
      server.once("error", reject);
    });
    process.env.DIL_TEST_MODEL_KEY = key;
    const endpoint = { url: `http://127.0.0.1:${port}/v1`, model: "local", apiKeyEnv: "DIL_TEST_MODEL_KEY", timeoutMs: 10_000 };

    const direct = chat(endpoint, [{ role: "user", content: "hi" }]);
    assert.equal(direct.ok, true, JSON.stringify(direct));
    assert.match(direct.ok ? direct.text : "", /"keyed"/, "the key reached the server's header");

    const model = languageModel({ endpoint });
    const { step, data, events } = loop(createMind(model).rule);
    step("sun");
    step("rain");
    const everything = JSON.stringify(data.entries()) + JSON.stringify(events.all());
    assert.ok(everything.includes("keyed"), "the answer is in the store");
    assert.ok(!everything.includes(key), "the key is not");
  } finally {
    delete process.env.DIL_TEST_MODEL_KEY;
    server.kill();
  }
});

test("a local model with no key is reached without one", async () => {
  const server = spawn(process.execPath, ["-e", SERVER], { env: { ...process.env, EXPECTED_KEY: "none" } });
  try {
    const port = await new Promise<number>((resolve) => {
      server.stdout.once("data", (d: Buffer) => resolve(Number(d.toString().trim())));
    });
    const r = chat({ url: `http://127.0.0.1:${port}/v1/`, model: "local", timeoutMs: 10_000 }, [
      { role: "user", content: "hi" },
    ]);
    assert.equal(r.ok, true);
    assert.match(r.ok ? r.text : "", /"unkeyed"/);
  } finally {
    server.kill();
  }
});

test("an endpoint no one answers at is a failed request, not a crash", () => {
  const r = chat({ url: "http://127.0.0.1:9/v1", model: "local", timeoutMs: 2_000 }, [{ role: "user", content: "hi" }]);
  assert.equal(r.ok, false);
});

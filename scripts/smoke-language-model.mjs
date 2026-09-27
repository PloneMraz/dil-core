// Smoke test: the mind thinking with a real language model, over a scripted region.
//
//   pnpm build && node scripts/smoke-language-model.mjs [URL] [MODEL] [CYCLES]
//
// URL defaults to a local llama.cpp server (http://127.0.0.1:8080/v1). For a
// hosted model, set the key in an environment variable and pass its name as
// DIL_SMOKE_KEY_ENV. The region is one entity whose value runs in a cycle of
// three (sun, sun, rain): a mind that learns it stops being surprised.

import {
  createCycle, createGlobMod, createDataStore, createEventLog, checkConformance,
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
  createMind, languageModel,
} from "../dist/index.js";

const url = process.argv[2] ?? "http://127.0.0.1:8080/v1";
const model = process.argv[3] ?? "local";
const cycles = Number(process.argv[4] ?? 12);
const endpoint = {
  url,
  model,
  timeoutMs: 300_000,
  ...(process.env.DIL_SMOKE_KEY_ENV ? { apiKeyEnv: process.env.DIL_SMOKE_KEY_ENV } : {}),
  extra: { temperature: 0.2, max_tokens: 400, chat_template_kwargs: { enable_thinking: false } },
};

const lm = languageModel({ endpoint });
const mind = createMind(lm);
const layers = {
  t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
  t5: createT5({ predict: mind.rule }), t6: createT6(), t7: createT7(), t8: createT8(),
};
const data = createDataStore();
const events = createEventLog();
const glob = createGlobMod({}, 0);
const cycle = createCycle({ layers, glob, data, events, initialEmission: { action: "boot" } });

const pattern = ["sun", "sun", "rain"];
const started = Date.now();
for (let i = 0; i < cycles; i++) {
  const value = pattern[i % pattern.length];
  const t0 = Date.now();
  const before = mind.report();
  const r = cycle.run({
    signals: [{ source_id: "ch", raw_payload: { entity: "weather", value }, t: Date.now() }],
    changes: [],
  });
  const after = mind.report();
  const thought = after.thoughts > before.thoughts;
  console.log(
    `cycle ${String(i).padStart(2)}  ${value.padEnd(4)}  ${after.held > before.held ? "held  " : "missed"}` +
      `${thought ? `  thought (${((Date.now() - t0) / 1000).toFixed(1)} s)` : ""}` +
      `${r.tests.length ? `  command ${JSON.stringify(r.tests)}` : ""}`,
  );
}

const report = mind.report();
const thoughts = data.entries().filter(([, d]) => d.open.kind === "thought");
console.log("\n=== the mind ===");
console.log(`expectations ${report.expectations}, held ${report.held}, thoughts ${report.thoughts}, asks ${report.asks}, commands ${report.commands.length}`);
console.log(`answers kept ${thoughts.length}, taken ${thoughts.filter(([, d]) => d.payload.taken).length}`);
console.log(`notes: ${JSON.stringify(lm.notes())}`);
console.log(`field at the end: ${JSON.stringify(glob.current().params)}`);
console.log(`wall: ${((Date.now() - started) / 1000).toFixed(0)} s`);
for (const [id, d] of thoughts.slice(0, 3)) console.log(`\n${id}: ${d.payload.text}`);
console.log("\n=== conformance ===");
console.log(checkConformance(events).results.map((c) => `${c.id}:${c.verdict}`).join(" "));

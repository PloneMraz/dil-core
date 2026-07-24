# Changelog

All notable changes to DIL are documented here, ordered newest-first.

---

## [Unreleased] — 2026-07-24

### — feat: §6.4 Emission — Directive, issuing_layer, no-arbiter (Bước 4)
**Commit:** `e9e59f4`

Emission = link 5 như một **năng lực ngang**. Thêm type **`Directive`** (§6.1: `committed_action`, `register` luôn ↔ không bao giờ `=` — INV-2, `issuing_layer`, `built_from`) và dòng **`activityKind:"emission"`** (`recordEmission`) khớp nhật ký Bước 2 — mỗi emission là một dòng `[event]` mang layer phát. `cycle.ts` mô hình **một emission thật/cycle** (response từ appraisal, phát ở cuối meaning-channel → issuing layer T8) qua helper **`emit()`** mà bất kỳ layer nào **có thể** gọi; **không arbiter** nội bộ — xung đột va chạm thành ResistEvent. **Phạm vi trung thực** (theo tác giả): emission *thật* chỉ có với host thật; probe/query/test theo layer là năng lực kiến trúc đỡ, không phải hành vi bịa khi không region nào nhận. §13.3 giờ verify mỗi emission mang register ↔ + issuing layer 1–8 + báo no-arbiter; serialize/deserialize + inspector xử lý form emission. E2E: 12 emission/12 cycle, vẫn 6 pass / 1 partial / 0 fail. 3 test mới (205 tổng), tsc sạch.

---

### — feat: provenance state graph — 5 states, 11 edges, §13.6 edge check (Bước 3)
**Commit:** `7798535`

v0.3.2 §9: provenance là **đồ thị có hướng**, không phải chuỗi. Thêm `simulated`/`projected` vào type `Provenance` và **tập 11 cạnh** (`PROVENANCE_EDGES`) làm nguồn sự thật, kèm `isProvenanceEdge`/`assertProvenanceEdge`. `prior` là **cửa vào một chiều** (không cạnh nào trỏ tới); `running/simulated/projected/scar` tuần hoàn không có trạng thái kết thúc. `toRunning`/`toScar` validate qua tập cạnh (`toScar` đến được từ `running` HOẶC `projected`; đều đòi collision). Checker §13.6 đọc các dòng `provenance` trong `[event]`, **fail** nếu có bước không phải cạnh, hoặc một datum vào `prior` quá một lần. **Phạm vi: đây là *luật*** — `simulated`/`projected` chưa được *đi tới*; loop chạy vẫn `prior→running→scar` (tập con hợp lệ), exercise forward-state là Bước 6. E2E vẫn 6 pass / 1 partial / 0 fail. 4 test mới (202 tổng), tsc sạch.

---

### — fix: [event] timestamp is the host wall-clock, separate from cycle
**Commit:** `575258b`

Driver tối thiểu trước đây stamp `timestamp` bằng **số cycle** — trùng `cycleMark` và vô dụng cho audit. Giờ tách hai: `cycleMark` giữ số cycle, `timestamp` là **đồng hồ server của host** (epoch-ms) lúc ghi event, để auditor **so sánh và đồng bộ** diễn biến của datum liên-event, liên-host. Thêm seam `now()` trên `CycleDeps`/`DaemonDeps` (requisition đồng hồ host; mặc định `Date.now()`). `cycle.ts` stamp mọi dòng `[event]` (layer-exit/provenance/scar/cycle-seal + timestamp lúc admit) bằng một lần đọc wall-clock/cycle. Lưu epoch-ms (chính xác, sắp xếp được, không lệ thuộc múi giờ để sync liên-host); `displayName` render `[yyyyMMdd]_[hh:mm:ss]` UTC, inspector hiện `HH:mm:ss` trên dòng lean. 198 test, tsc sạch.

---

### — feat: [event] as the datum's activity journal; path read from it (Bước 2, §9)
**Commit:** `d117f6d`

§9 "mịn" (tác giả chốt): mỗi biến động của datum là **một dòng `[event]`**, ghi khi xảy ra — "nó chỉ là log". Vì §9 nói *"an activity record is trace, not experience"*, đỉnh chỉ hai kind: `scar` (kinh nghiệm — self học **chỉ** từ đây) vs `activity` (ô trace); transition là một `activityKind` dưới `activity`, không phải kind thứ ba: `cycle-seal` (record niêm phong cycle + datum + anchor), `layer-exit` (nhẹ: datumId + layer), `provenance` (nhẹ: datumId + from→to). **Bỏ `TaggedDatum.trace` + type `LayerTrace`** (tag chỉ đặt tên hiện tại — §9); `stampLayer` chỉ cập nhật floor-tag. Path đọc từ các dòng `layer-exit` trong `[event]`, keyed theo `datumId` (= khoá `[data]`; dọn đường Bước 6 đếm vòng). `cycle.ts` ghi `prior→running` + 8 layer-exit + `running→scar` khi xảy ra; §13.3 tái dựng T1→T8 từ đó, không từ tag. Serialize/deserialize thành union theo `form`; inspector render từng kind. E2E: run bền 12 cycle giờ ghi **152 dòng `[event]`** (trước 33), conformance vẫn 6 pass / 1 partial / 0 fail đọc từ đĩa. 198 test, tsc sạch.

---

### — feat: wire requisition into daemon.start() — durable daemon (Bước 1.5d2)
**Commit:** `15bdbb7`

`daemon.start()` giờ áp luật store lên host khi khởi động: sau khi gate qualify, nếu `host.store.root` có → **requisition** chất nền (claim + `[data]`/`[event]`/`commits` bền + rà-soát bộ nhớ host thành `prior`), rồi dựng cycle trên các store bền đó; không có chất nền → lùi về store in-memory tiêm vào (test/throwaway). Dời việc dựng store/cycle/recovery vào `start()`. `DaemonDeps.data/events` thành tuỳ chọn; `Daemon` thêm `requisitionReport()` (admitted/rejected) và `close()` (giải phóng handle chất nền). Đường test cũ (root vắng = fixture) không đổi. 2 test daemon-bền mới chứng minh: admit `prior` khi khởi động, `[event]` xuống đĩa + chain verify, log resume và tiếp tục lớn qua restart (INV-5, không roll back). **Bước 1.5 khép** — verify E2E: daemon bền chạy 12 cycle, auditor độc lập đọc `[event]` từ đĩa chấm 6 pass / 1 partial / 0 fail. 197 test, tsc sạch.

---

### — feat: requisition orchestration + scan/admit-as-prior (Bước 1.5d1)
**Commit:** `09af31e`

Thủ tục áp-luật-khi-khởi-động, dạng hàm độc lập: `requisition(host)` claim chất nền (DIL-CLAIM), bind các store bền DIL cai trị (`[data]` SQLite dưới `memory/`, `[event]` JSONL bền dưới `event-log/`, commit DAG dưới `commits/`), rồi **rà soát bộ nhớ có sẵn của host** và ép mọi item qua tagging-gate — kiểm duyệt + đóng dấu `prior` — trước khi vào `[data]`. Không gì vào mà chưa tag (không cửa hông); item không tag hợp lệ được thì bị từ chối + báo cáo, không tuồn lén. `HostDeclaration.store` thêm seam `preexisting` (host khai *chỗ* nội dung; DIL sở hữu việc đóng dấu). Additive — daemon vẫn dùng store in-memory tiêm vào; nối `requisition` vào `daemon.start()` là sub-step kế. 5 test mới (195 tổng), tsc sạch.

---

### — feat: durable [event] log, disk = source of truth (Bước 1.5c)
**Commit:** `ac33e1b`

Nguồn-sự-thật của `[event]` chuyển sang chất nền. Thêm `deserializeEventRecord` (đảo ngược của `serializeEventRecord`, **không mất thông tin**) + `readLogRecords(dir)`; `createDurableEventLog(dir)` append vào sink JSONL hash-chain và **đọc (`all`/`bySourceId`) từ đĩa**, RAM chỉ giữ **counter đơn điệu + chain head** — RAM không còn phình vô hạn ("phình vô hạn" fix), và auditor tin log bền được neo chứ không tin RAM. Reopen thì resume counter + chain từ chất nền. Đường per-cycle chỉ `append` + `size()` (O(1)); `all()` là đọc audit-time. `createEventLog` in-memory giữ làm fixture test. 4 test mới (190 tổng), tsc sạch. Sửa kiểu `floorTag` trong `SerializedEventRecord` (`LayerIndex`).

---

### — feat: SQLite-backed [data] store (Bước 1.5b)
**Commit:** `e2facea`

`[data]` (present khả biến, ghi-đè mỗi cycle) có biểu diễn bền trên chất nền: một bảng SQLite dưới `store/memory/` qua **`node:sqlite`** (SQLite dựng sẵn trong Node — đồng bộ khớp interface `DataStore`, zero external dep, không biên dịch native). Một hàng/key, `TaggedDatum` là JSON; upsert giữ rowid ổn định nên `entries()` giữ thứ tự chèn qua các lần cập nhật. `createSqliteDataStore` đứng sau interface `DataStore`; Map in-memory (`createDataStore`) hạ cấp thành fixture test. Khai vào `STORE_REPRESENTATION` (tag F): store-of-record trên chất nền, RAM chỉ cache; deployment có thể đổi engine (vd `better-sqlite3`) sau cùng interface. 4 test mới (186 tổng), tsc sạch.

---

### — feat: substrate claim + DIL-CLAIM (Bước 1.5a)
**Commit:** `ebab045`

Bước 1.5 sub-step (a) của migrate v0.3.2 — nền của nguyên tắc sovereign trong code: host chỉ cung cấp **chất nền lưu trữ thô** (thư mục/phân vùng), DIL **trưng dụng** và áp luật store của mình lên. Thêm `store/substrate.ts`: layout chuẩn `store/{memory,event-log,commits}` và **DIL-CLAIM** (DIL đóng dấu chất nền theo phiên bản luật protocol/tagSchema/layout). `claimSubstrate()` dựng layout + ghi claim khi mới; khi resume thì verify claim khớp và **từ chối** claim lạ/không tương thích/hỏng. Ops vật lý sau seam `Substrate` tiêm được (mặc định `node:fs`). `HostDeclaration.store` thêm `root?` (địa chỉ chất nền; vắng = fixture in-memory). **Chưa** đổi backing `[data]`/`[event]` — non-breaking. 5 test mới (182 tổng), tsc sạch. Chọn `node:sqlite` (dựng sẵn Node 24, đồng bộ, zero external dep) cho `[data]` ở sub-step (b).

---

## [Unreleased] — 2026-07-23

### — feat: drop layer_trace from InfoUnit (v0.3.2 §6.1, MUST)
**Commit:** `2742c71`

Bước 1/7 của migrate v0.3.2. Gỡ trường `layer_trace` khỏi type `InfoUnit` ([loop/types.ts](src/loop/types.ts)) và các literal ở T1/T3 — đây là một MUST của §6.1: trường này lặp lại (trong một type running khả biến) đúng path mà `[event]` đã ghi, và **không layer nào đọc**. Chỉ chạm `InfoUnit`; `TaggedDatum.trace` (được đọc thật) sẽ chuyển sang `[event]` ở Bước 2. Cập nhật các construction `InfoUnit` trong test loop. `tsc` sạch, 177/177 test xanh.

---

### — docs: align CONTEXT with v0.3.2, flag code deltas in README, add parent spec
**Commit:** `015a9af`

CONTEXT.md (định hướng theo luật) đưa thẳng sang ngữ nghĩa v0.3.2: provenance **state-graph** (`prior` là cửa vào một chiều; `running`/`simulated`/`projected`/`scar` tuần hoàn, không trạng thái kết thúc), đường đi đọc từ `[event]` chứ không từ `layer_trace`, emission là **năng lực ngang** (§6.4), và DECIDE@IMPL tag H. README.md (mô tả code đã build — vẫn theo v0.2) giữ nguyên phần tả code cho trung thực, nhưng khôi phục mục **Deferred** (đang ghi "Empty") thành danh sách delta v0.3.2 **chưa migrate**: state-graph provenance, gỡ `layer_trace` khỏi `InfoUnit`, §6.4 Emission + `Directive` + `issuing_layer`, Mode-B "return-not-write", tag H. Track thêm `DIL-en-v6.md` (parent spec mà v0.3.2 §14 trỏ tới).

---

### — docs: point docs to protocol v0.3.2, remove v0.2
**Commit:** `7c1dbf3`

Con trỏ "the law" trong AGENTS.md, CONTEXT.md và README.md đổi từ `DIL-protocol-v0.2.md` sang `DIL-protocol-v0.3.2.md`; bản v0.2 đã xoá. Docs giờ trỏ đúng protocol quy phạm hiện hành. Đây mới là cập nhật con trỏ tài liệu — **code chưa** được đối chiếu với các thay đổi quy phạm của v0.3.2 (gỡ `layer_trace` khỏi `InfoUnit`, hai trạng thái provenance `simulated`/`projected` + đồ thị lifecycle, §6.4 Emission + type `Directive` + `issuing_layer`, Mode-B "return-not-write", tag H).

---

## [Unreleased] — 2026-07-07

### — fix: §13.4 detail is fork-aware
**Commit:** `afa92cd`

Sau recovery, cycle mới hợp lệ đi lại các số cycle cũ — cycle-mark không đơn điệu trong log không tự động là "accrual hỏng": detail của §13.4 giờ hướng auditor đối chiếu commit DAG (fork marker mang `recoveredFrom`). Verdict không đổi (§13.4 partial by design). Tổng duyệt cuối chạy sạch: 177/177 tests; run đa nguồn 6 pass / 1 partial / 0 fail.

---

### — feat: §9 commit/snapshot/recovery — git-style markers, scar rhythm, rollback
**Commit:** `ec8d591`

Mục core cuối cùng. `CommitStore` (`store/commits/`) giữ object kiểu git: content-addressed, write-once (`wx`, dedup tự nhiên, sửa file là gãy chính tên nó), marker trỏ parent thành DAG, `HEAD` là ref di động duy nhất. Marker ghim chain head của `[event]`, counters, config đã khai, và địa chỉ nội dung của snapshot **toàn hệ thống** (2-(a)): T2/T5/T6/T7 có `snapshot()/restore()`, GLOB-MOD `restore` (recovery-only), cycle driver (resume + snapshot), `[data]`. Commit tự động sau `COMMIT_EVERY = 9` scars tại ranh giới cycle (nhịp scar theo tác giả; chuỗi êm ả không tự commit — thuộc tính khai báo); `daemon.commit()` là cò thủ công ngoài loop. Recovery (`recoverFrom`) khôi phục trọn state đã tích lũy (INV-5 nguyên vẹn) + đóng **fork marker** (`parent = recoveredFrom`, đúng ngữ nghĩa nhánh git); `[event]` log **không bao giờ roll** — ghi xuyên qua recovery. Retention: marker không bao giờ prune; payload `all`, sàn `MIN_SNAPSHOTS_RETAINED = 9`. 6 test mới, gồm chứng minh hành vi (expectation khôi phục dự đoán đúng — không scar giả) và log-sống-sót-qua-rollback. 177 tests. **Danh sách Deferred giờ TRỐNG.**

---

### — docs: layout — one parent root `store/{memory,event-log,commits}`
**Commit:** `dcd471e`

Wrapped the three persistence directories under one parent named after the ring itself (§3: the two *store* kinds): `store/memory/` (nơi duy nhất rollback ghi đè), `store/event-log/`, `store/commits/`. Một footprint duy nhất; ranh giới rollback không đổi.

---

### — docs: layout — event-log/ and commits/ beside memory/, not inside
**Commit:** `de3e312`

The directory boundary is now the rollback boundary: `memory/` holds only `[data]` and restorable working state (the one location recovery rewrites); `event-log/` and `commits/` sit **beside** it, outside the loop's mutable reach — never rolled back. A rollback rewrites `memory/`, keeps recording into `event-log/`, and adds a fork marker to `commits/`; it deletes nothing. Declared in `store/decisions.ts`.

---

### — feat: activity records + daily/size-segmented [event] sink (§9 amendment)
**Commits:** `a1e72fb` (protocol + code), `31cf6dc` (README)

Protocol §9 amended by the author: ResistEvent = atomic unit of **experience**; the log's audit role (E4) now records one **activity record** per cycle (emitted action, observed entities, flow mode; embeds the cycle datum) — *trace, not experience*: no layer learns from it, quiet stretches stay auditable. §13.6 adds contiguous activity coverage; the checker verifies both record kinds and derives resistance/diversity from scars only. The sink becomes a directory of daily segments `event-log-yyyymmdd.jsonl` with declared `MAX_SEGMENT_BYTES = 64 MiB` (`-002` overflow; records never split; the chain continues across segments/restarts). Log-length policy declared: **no maximum** — no record removed, no segment pruned, snapshots never license truncation, append failure halts the loop; archival deployment-open. 171 tests; conformance numbers unchanged (4/3/0 thin, 6/1/0 diverse).

---

### — feat: multi-stream flow — consumption via the meaning-channel (cycle-1+)
**Commit:** `8047324`

Protocol §6's multi-stream implemented as a flow-topology property (cycle-time, no OS concurrency claimed). Cycle-0 stays a direct hand-off pipeline; from cycle-1 every layer publishes on the meaning-channel and each consumer **reads** its declared dependency set (consumption, not dispatch; INV-3 guarded per read). Fan-out real (T5's one output read by both T6 and T7); T6 declares `consumes [2,5]` and reads T2 itself, fixing the driver-smuggled `envPushed`; unpublished dependency → `MultiStreamError`. Mode recorded as the `flow` open tag; §13.3 verifies it against the cycle-mark and fails on contradiction. `MULTI_STREAM_SCHEDULE` declared. 8 new tests (167 total). Deferred list is now a single item: §9 full-system commit/snapshot/recovery.

---

### — feat: tamper-evidence — sha256 hash chain over the [event] sink
**Commits:** `aa158e4` (chain + sink), `dbe4cb8` (README)

Each persisted JSONL line is chained (`seq` + `prev` + sha256 hash over the fixed-order record); `verifyJsonlSink` detects any altered, removed, inserted, or reordered line at the break point; the chain resumes across restarts, refuses to open on a corrupt tail, and exposes `head()` for external anchoring. Honest scope declared (`EVENT_TAMPER_EVIDENCE`): detection is relative to a trusted head — anchoring is deployment-open; in-process tampering out of scope; NOT the §9 full-system commit/snapshot, which stays DEFERRED (layer state not yet serializable). node:crypto only, zero new dependencies. 8 new tests (159 total), verified on real bytes (one-byte tamper → `content break` at line 0).

---

### — feat: precondition gate probes E3/E4 — evidence-graded verdicts
**Commit:** `eeff8e7`

Each gate verdict now carries a basis: `probed` (the gate exercised a host-declared handle — StoreProbe marker round-trip for E3/P(b), TraceProbe marker read-back for E4) or `declared` (requisition's designed mechanism, graded honestly). Evidence beats claim: a failing/throwing probe fails a true declaration; a negative declaration is not overruled by a working probe. E1/E2/P(a)/P(c) stay declaration-based with declared reasons (E2: idle is the default — a silent probe window proves nothing; P(c): testing self-wipe means inducing a mismatch, i.e. running). §13.2 surfaces probed/declared counts. 151 tests.

---

### — docs: README — split open items into deferred vs deployment-open
**Commit:** `9b7ed8d`

The "Deferred" section mixed two kinds §12 itself distinguishes: unbuilt core work (tamper-evidence, multi-stream) versus deliberately-open deployment declarations (Mode-B liveness/tag D, the reflection reader/tag E, the open-tag registry/tag F). Split into two subsections so a deployment property is never again misread as unfinished work.

---

## [Unreleased] — 2026-07-06

### — feat: reflection mechanism — read collision into coordinates (tag E)
**Commits:** `c40f50a` (mechanism), `560389b` (README)

Wired tag E (§8.4): a third party reads a recorded collision out of the `[event]` log into coordinates (`collisionCoordinates`/`formReading` — fabrication about a non-existent collision is refused) and returns it through a declared T3 channel (`reflectionSignal` + `reflectionTransducer`), classified ENV_PUSHED. The coordinate system is the `[event]` log itself; no parallel channel, no self-reflection faculty; who the reader is stays deployment-open like tag D. `REFLECTION_MECHANISM` no longer DEFERRED; §13.5 now passes on runs whose traces show diverse sources (diverse run: 6 pass / 1 partial — the remainder is §13.4 Self, partial by design). 144 tests.

---

## [Unreleased] — 2026-07-05

### — docs: README — Mode-B liveness is a deployment property
**Commit:** `177b6a0`

Corrected the Deferred bullet that misframed "Live Mode-B" as unbuilt machinery. The Mode-B seam (`HostSource`) is built and declared (tag D); an Other is a positional status, not a kind — one channel carries any number of Others, so no per-Other source file exists to be written. What stays open is *deliberately* open per protocol §12: which live Other a deployment plugs in. The honest residual: the shipped scripted **test fixture** yields fixed, replayable (deceleration-grade, §8.3) resistance.

---

### — docs: README — fix blockquote lead-in, qualify audit-ready claim
**Commit:** `edbc4bf`

Blockquote lead-in corrected from "the two normative documents" (three bullets, only one normative) to "Read this alongside:", keeping the normative annotation on the protocol bullet only. Line 1's unconditional "audit-ready" scoped to the `[event]` trail, durable only when backed by the JSONL file sink. Raw sink bytes verified on disk (fixed-order tags, ≥3 open tags incl `domain`, full layer_trace) via a temporary script, deleted after the run.

---

## [Unreleased] — 2026-06-30

### 18:05 — docs: README updated for evidence-based checker + durable sink
**Commit:** `d396a08`

Status reports the real 4 pass / 3 partial / 0 fail of a short run (honest partials explained); Quick start drops the removed `diversityWired` flag and adds a JSONL file-sink example; the store section documents durability vs tamper-evidence; Deferred lists tamper-evidence honestly.

---

### 17:55 — fix: durable append-only JSONL sink for the [event] log (ISSUE 3)
**Commit:** `5e1a451`

Added an `EventSink` interface (only method: `write` — no update/delete/truncate by construction) and a JSONL file sink (`node:fs`, append mode, one immutable fsynced line per record, tags serialized in fixed order). `createEventLog` gains an optional sink and mirrors every appended record; in-memory stays the default. Declared `EVENT_DURABILITY` in `store/decisions.ts`. Durability only — tamper-evidence (content-addressed/hash-chained markers) stays deferred, not faked. Tests: survive reopen, no mutation surface, ordered round-trip.

---

### 17:45 — fix: conformance checker derives diversity from evidence (ISSUE 2)
**Commit:** `fa23f07`

Removed the `diversityWired`/`diversitySignal`/`reflectionWired` self-attestation flags — a criterion satisfied by the caller's claim is not a measurement. Criterion 7 (§13.7) is now derived from the `[event]` log's source_id distribution over a declared window (enough evidence + diverse → pass; single-source collapse → fail; too thin → partial, never a false pass). Criterion 5's reflection status reads from `REFLECTION_MECHANISM`. Declared `CONFORMANCE_DIVERSITY_WINDOW=8` / `CONFORMANCE_MIN_DISTINCT_SOURCES=2` in `conformance/decisions.ts` as tunable, not-derived. Result: a thin run scores 4/3/0; a genuinely diverse run scores 5/2/0.

---

### 17:35 — docs: add README
**Commit:** `a915a70`

Added a project README: the `host + self = agent` equation and the reign-not-rule principle, the four concentric rings mapped to `src/` directories, the six build stages with their fixed checks, install/test commands, an end-to-end quick-start (daemon + inspector + conformance), the `[data]`/`[event]` store and tag schema, the declared DECIDE@IMPL choices, and an honest list of deferred items.

---

### 17:20 — feat: conformance checker — the seven §13 criteria (stage 6)
**Commit:** `b284ced`

`checkConformance` reads the `[event]` log (the one trusted trace) plus observable facts (gate outcome, diversity signal) and scores each §13 criterion into a per-criterion pass/partial/fail/unverifiable table; `renderConformance` prints it. Deliberately honest: criterion 4 (Self) is PARTIAL because self-continuity is attributable only by a third party (§7); criterion 5 (Resistance) is PARTIAL while reflection is DEFERRED (§8.4); an empty log is unverifiable, never passed. Verified end-to-end over a real daemon run (5 pass, 2 partial, 0 fail). 8 tests (127 total). **Stage 6 complete — the build order is finished.**

---

### 17:00 — feat: runtime daemon — continuous run (stage 5)
**Commit:** `1c962cb`

Wired the loop as a long-lived daemon (CONTEXT.md §4). `createDaemon` holds **one** persistent cycle instance and drives it over a `HostSource`, so state accrues across cycles (INV-5) and the causal line is unbroken — the self is what occurs while it runs, with no internal continuity claim. Startup is precondition-gated (non-qualifying host → clean non-start). Added the requisition ring `src/runtime/`: `HostSource` + scripted source, the diversity-loss monitor (§11, conformance criterion 7), and the daemon. Collisions are now sourced by entity so diversity is measurable. Declared tag D (live Mode-B = host source) as the real brake replacing the static anchor; tag E (reflection) declared DEFERRED; diversity thresholds tunable. End-to-end verified (5-cycle run records value-mismatch + absence scars). 7 tests (119 total). **Stage 5 complete.**

---

### 16:40 — feat: cycle driver — one full loop pass (stage 4e, stage 4 complete)
**Commit:** `4f3dfbe`

`createCycle`/`run` drives one pass T1→T8 single-threaded (cycle-0), threading a cycle datum through every layer so it accrues a floor-tag and trace entry at each (trace `[1,1..8]`, floor-tag 8). Runs the appraisal step (INV-8) under the cycle's GLOB-MOD context (§8.5), produces a response that feeds back as the next emission (INV-1), records held collisions as scars in the `[event]` log (the event inheriting the cycle datum's `domain`), and advances GLOB-MOD to N+1 (INV-7). Declared the Mode-A appraisal anchor as static (tag C) with the honest §8.3 caveat; live Mode-B (tag D) deferred to stage 5. Added `appraisal.ts`. 8 tests (112 total). **Stage 4 complete** — the loop runs one cycle correctly.

---

### 16:20 — feat: layers T6, T7, T8 (stage 4d, part 3 — all eight layers)
**Commit:** `3837e07`

T6 (Other-Model Synthesis) accrues per-entity independence evidence (resistance met, env-pushed), non-zero only under Mode-B, degenerating under Mode-A. T7 (Absence Registration) registers an expected entity's failure to return as a signed-negative PredErr (observed null, signed "-"), accruing expected entities (INV-5). T8 (Multi-Entity Abstraction) builds RelValue only when N≥2 (ranked by resistance) and passes through Other↔Other SocialEdges; asserts its output is a correlation, never an identity (T8-INV / INV-2). 8 tests (104 total). All eight layers T1–T8 now exist.

---

### 16:05 — feat: layers T3, T4, T5 (stage 4d, part 2)
**Commit:** `ce32db1`

T3 (Channel Ingestion) transduces signals into typed InfoUnits, keeping info-type and physical channel distinct (per-channel transducer is pluggable DECIDE@IMPL). T4 (Context Binding) binds to `entity_id` or STRANGER via a pluggable resolver. T5 (Temporal Expectation) builds a per-entity Expectation and emits a signed PredErr — where resistance becomes information — under the declared persistence law; state accrues per entity (INV-5), confidence ramps over `SUFFICIENT_RECURRENCE`, and PredErr falls to zero with repetition against a stable entity (C2). Declared tag-B thresholds (`BASELINE_WINDOW=16`, `SUFFICIENT_RECURRENCE=3`) openly as tunable. 8 tests (96 total).

---

### 15:50 — feat: layers T1 and T2 (stage 4d, part 1)
**Commit:** `604317e`

T1 (Activity-Environment Confirmation) confirms the root reference frame, no self/env line. T2 (Agency Differentiation) draws the agency line across cycles: UNDECIDED until `STABILITY_THRESHOLD` cycles accrue, then SELF_WRITTEN vs ENV_PUSHED by matching recent emissions. Where the self crystallizes (§7); no self-continuity claimed. State accrues (INV-5); once stable nothing leaves UNDECIDED (INV-6 postcondition). Declared tag-B thresholds (`MATCHING_WINDOW=8`, `STABILITY_THRESHOLD=3`) openly as tunable starting values, not derived constants. 8 tests (88 total).

---

### 15:35 — feat: layer scaffold + meaning-channel + topology (stage 4c)
**Commit:** `1f6030f`

The uniform harness T1–T8 plug into, no layer logic yet. `LayerSpec` fixes the In/Out/Pre/Post contract; `runLayer` runs pre→process→post, asserts INV-4 (ref_frame≠null) on emitted InfoUnits, and stamps the floor-tag/layer_trace. `validateLayerSpec` enforces INV-3 at registration. The meaning-channel (up) guards reads by INV-3, separate from the modulatory field (down). `topology.ts` gives the canonical T1→T8→T1 edges and validates closure (INV-1). 10 stub-driven tests (80 total): a datum traverses leaving a floor-tag at each layer; halts on INV-3/INV-4/INV-1.

---

### 15:20 — feat: GLOB-MOD modulatory field (stage 4b)
**Commit:** `c218100`

The modulatory field (INV-7) as a double-buffered `ModField`: `createGlobMod` / `current` / `contribute` / `advance`. Update law (option A, declared): a convex per-key weighted average of a cycle's contributions, untouched keys carrying over, effect at N+1. Guarantees: `contribute()` never changes the active field (within-cycle immutable; `advance` routes through `assertGlobModUpdate`), and the convex blend keeps the field within its contributions' range — no runaway, no gain cap, no inertia constant invented. 9 tests including a 50-cycle randomized no-runaway check (70 total).

---

### 15:05 — feat: loop shared types §6.1 (stage 4a)
**Commit:** `8620c11`

First slice of the loop. Defined the §6.1 shared types (`RefFrame`, `Signal`, `InfoUnit`, `ActivityEnvironment`, `Expectation`, `PredErr`, `OtherModel`, `RelValue`, `SocialEdge`, `ModField`, `Appraisal`) in `src/loop/`. **INV-4 enforced at the type level**: `InfoUnit.ref_frame` is non-nullable, so a Signal (no frame) is not an InfoUnit. Reconciled with inner rings — the loop borrows `LayerIndex`/`AgencyTag` from invariants and `LayerTrace`/`ResistEvent`/`MismatchKind` from the store rather than redefining them. Declared DECIDE@IMPL tag A (concrete representations) in `loop/decisions.ts`. 61 tests, including `@ts-expect-error` type-level checks.

---

### 14:50 — feat: read-only inspector for [data] and [event]
**Commit:** `784dca0`

Added `inspectData` and `inspectEventLog`: a read-only human-readable view of the store using the `displayName` projection, so a person can see each item's tags on access. Read-only by construction (calls only read methods, never mutates); added a read-only `entries()` enumeration to `DataStore`. Rendering complete and tested; live-daemon wiring is stage 5. 56 tests.

---

### 14:35 — feat: displayName — derived tag→name projection
**Commit:** `35efb4a`

Added `displayName(datum)` and `eventDisplayName(record)`: a human-readable name **computed from** a datum's tags, not a place tags live. Tags stay structured properties; the name is derived on demand, so the updatable floor-tag and advancing provenance never force a rename, and keyed open tags render as `key:value` (filterable, not lossy positions). Store-kind prefix omitted — kind is carried by location. Declared the planned file-backed layout (`memory/data`, `memory/event-log`) in `decisions.ts`. 52 tests.

---

### 14:20 — feat: [event] record inherits its tags from the scar it traced
**Commit:** `343d24b`

An `[event]` record now embeds the whole `scar` `[data]` datum rather than re-stating a tag subset, inheriting its four fixed tags, ≥3 open tags (including `domain`), and `layer_trace`. So an `[event]` record carries the same minimum seven tags as any datum, plus the anchor, with no tag drift. `EventRecord` is now `{ event, scar, anchor }`; new `recordScar()` requires provenance `scar` (only collision-and-hold reaches `[event]`) and throws `EventRecordError` otherwise. New tests assert tag inheritance and non-scar rejection. 47 tests.

---

### 14:05 — feat: floor-tag is an updatable slot; add separate layer_trace
**Commit:** `376da4f`

Reconciled floor-tag semantics. The floor-tag is a single slot each layer **overwrites** to the layer just exited ("where is it now"); the four fixed slots are never stripped or reordered, but their values advance under defined rules. The full path lives in a separate `layer_trace` (§6.1), appended at each layer and read for audit ("where has it been"). Code: `TaggedDatum` gains `trace: LayerTrace`; the tagging-gate seeds it; new `stampLayer` primitive overwrites floor-tag + appends to trace. Fixed the imprecise "never overwritten" / "leaving a floor-tag at each layer" wording across protocol §9/§13.6, AGENTS.md, CONTEXT.md. 45 tests.

---

### 13:50 — feat: require at least three open tags per datum
**Commit:** `2d78737`

Protocol §9 now requires every datum to carry at least three open tags, one being `domain`, each describing a real dimension. Reconciled the earlier anti-quota wording: the minimum is a **floor on honest description**, not a quota to pad — a tag that does not describe the datum still fabricates data and is forbidden. Updated §9 (open layer + discipline) and conformance §13.6. Enforced via `MIN_OPEN_TAGS=3` in `tags.ts`; the gate checks presence/count/verdict structurally, while honest description stays the minter's responsibility and an auditor's read. 42 tests.

---

### 13:35 — docs: fix open-tag discipline; registry is host-declared
**Commit:** `9b71c7a`

Clarified the open-tag layer. Protocol §9 gains an "Open-tag discipline" clause: a key names a descriptive dimension, governed by exactly two rules (keys consistent, never a verdict). The core fixes **no** industry vocabulary and **no** required number of open tags — sufficiency is the deployment's audit needs, and inventing tags to meet a quota would fabricate data. §12 tag F now covers the open-tag registry as industry-specific DECIDE@IMPL. Declared `OPEN_TAG_REGISTRY = free-form` with an empty `OPEN_TAG_DEFINITIONS` slot a real deployment fills; no registry enforcement built.

---

### 13:20 — feat: require mandatory open tag `domain` for auditability
**Commit:** `239a08b`

Protocol §9 correction. The open-tag layer was imprecise: it is now stated that every datum MUST carry at least the open tag `domain` (the data class) so the `[event]` log is auditable by class, while other open tags stay optional and may vary by data type. Updated protocol §9 and conformance §13.6, and enforced the rule at the tagging-gate (`REQUIRED_OPEN_TAG_KEYS` in `tags.ts`); admission now fails when `domain` is missing or empty. `HostDatum.open` is now required. 41 tests.

---

### 13:05 — feat: experience store (tags, gate, [data]/[event], lifecycle, anchor)
**Commit:** `d8f3509`

Stage 3 of the build order. Added the fixed four-tag schema + open tags (`tags.ts`), the `ResistEvent` atomic unit + full field-state context anchor (`resist-event.ts`), the tagging-gate admitting host data only as `prior` with no side door (`tagging-gate.ts`), the append-only deep-frozen read-only `[event]` log (`event-log.ts`), and the mutable `[data]` store with the prior→running→scar lifecycle (`data-store.ts`). DECIDE@IMPL choices declared in `decisions.ts` (tag F: in-memory, source_id/provenance index, store-all, private; tag G: full-field-state anchor per the user's call). Commit/snapshot cadence deferred, left open rather than invented. 13 new smoke cases (40 total).

---

### 12:45 — feat: eight invariant guards (INV-1..INV-8)
**Commit:** `77f3aeb`

Stage 2 of the build order. Each invariant (protocol §5) is a guard that halts via a thrown `InvariantViolation` when a step would violate it — never a returned boolean. Added `violation.ts` (halt signal), provisional minimal `types.ts` (to be reconciled with full shared types in stage 4), and `guards.ts` (the eight guards). No thresholds, no `DECIDE@IMPL` touched. 17 dummy-data smoke cases assert each guard both halts a violating step and passes a conforming one (27 tests total).

---

### 12:30 — test: stage-1 smoke test for the precondition gate
**Commit:** `d8cfd56`

Added 10 `node:test` cases over `checkPrecondition` (no runtime dependency; added `@types/node` devDependency for built-in type declarations). Covers each of E1–E4 and P(a/b/c), the E2 void-field threshold, the P(b)=E3 coupling, and that the gate reports every failure rather than short-circuiting. Added `test` script (`tsc && node --test "dist/**/*.test.js"`).

---

### 12:20 — docs: add Vietnamese-only response rule to CLAUDE.md
**Commit:** `7852250`

Added a MUST rule: always respond in Vietnamese-only (English allowed for special phrases/terms).

---

### 12:15 — feat: precondition gate (E1-E4, P(a/b/c))
**Commit:** `f9d03cd`

Stage 1 of the build order. Added `HostDeclaration` (the host's structural self-description) and `checkPrecondition`, which runs all seven static checks and returns either `qualify` or a clean `non-start` with the failing conditions and a reason. No thresholds, no dependency on the loop/store/invariants.

---

### 12:00 — chore: scaffold TypeScript project and update CLAUDE.md
**Commit:** `21e8834`

Initialized dil-core with package.json, tsconfig.json, .gitignore, and src/. Added MUST commit rule to CLAUDE.md.

---

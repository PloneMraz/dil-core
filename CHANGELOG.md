# Changelog

All notable changes to DIL are documented here, ordered newest-first.

---

## [Unreleased] — 2026-07-24

### — feat: tín hiệu absorption, liên kết source tường minh, và resistance-reading cho absence (§8, §8.3)
**Commit:** `9753e4d`

Ba thứ phân tích cạn-nguồn / new-in-kind cần — không thứ nào cần bộ phân loại mismatch ("kind" ở §8.3 là *tính mới*, không phải taxonomy):

**(a) Ghép tường minh.** Dòng expectation nay mang `source` (== entity cho value-mismatch) — khóa ghép tường minh tới `scar.source_id` — nên bên thứ ba tương quan được tín hiệu học với các va chạm của một nguồn mà không phải đoán quy ước nội bộ.

**(b) Phủ absence.** T7 nay nêu **entity nào** im lặng + recurrence (`AbsenceReading`, vẫn là `PredErr`), và cycle ghi một dòng **`resistance-reading`** cho mỗi absence (source "region" — khóa ghép tới absence scar) — nên nguồn kháng cự bằng cách nín cũng đo được per-source, không chỉ value-mismatch.

**Absorption (§8.3).** Hàm thuần `measureAbsorption` đọc các reading đó, gom theo chủ thể kháng cự, báo per-source: nguồn **còn sai số ở recurrence cao = phanh thật** (còn collision new in kind); nguồn **sai số về 0 = đã học thuộc** (chỉ deceleration). Tín hiệu **bùng khi mọi nguồn đủ-thăm-dò đều đã hấp thụ**. Lộ qua `daemon.absorptionSignal()`; là **observability, KHÔNG phải tiêu chí §13** (§13.7 là *source* diversity — trục khác) — nêu trung thực, không mạo nhận conformance. serialize/deserialize + inspector + round-trip cập nhật. **7 test mới, 265 tổng, tsc sạch.** E2E: absence → `resistance-reading region/weather`; run học thuộc → `absorbed` + "deceleration only, not a real brake (§8.3)".

---

### — feat: genesis manifest — hiến pháp DECIDE@IMPL của run vào [event] (§9, §8.5)
**Commit:** `da5f7c6`

Cấu hình DECIDE@IMPL mà một run vận hành dưới đó **không có trong [event]**: bên thứ ba đọc chỉ log **không biết** thresholds, appraisal anchor + định danh transducer, Mode-B source, reflection mechanism, hay lựa chọn store/forward-building — nên **không re-appraise được** trace dưới đúng hằng số đã chi phối nó (§8.5). Per-line `schemaVersion` chỉ mô tả *tag schema*; hằng tunable không nằm đâu trong log (một phần config chỉ ở commit marker — ngoài [event], trong commit DAG, và chỉ khi có CommitStore). Thêm **bản ghi manifest một-lần** (kind LogRecord top-level mới `"manifest"`, không gắn datum) ghi làm **dòng [event] ĐẦU TIÊN** trên log rỗng, tại `daemon.start()`. [runtime/manifest.ts](src/runtime/manifest.ts) gom các hằng đã khai **verbatim** (không tự chép lại → không lệch khỏi decisions.ts). Nó **được hash-chain** như mọi dòng — chống-giả-mạo, không tách rời khỏi run — và ghi **một lần**: log resume (không rỗng) giữ manifest genesis, không có cái thứ hai. serialize/deserialize, inspector (`[manifest] …`), và kiểm §13.6 well-formedness đều xử lý; requisition vẫn không ghi gì (genesis thuộc daemon, lúc start). **5 test mới, 258 tổng, tsc sạch.** E2E: record #0 là manifest, `dil verify` chain nó, `decisions` mang trọn hiến pháp.

---

### — feat: ghi `PredErr.delta` vào dòng expectation — sai số dự đoán mỗi cứ thăm dò (§6.3 T5)
**Commit:** `5115524`

Dòng `[event]` expectation mang `confidence` + `recurrence` nhưng **thiếu `PredErr.delta`** — độ lớn sai số dự đoán T5 phát mỗi cứ thăm dò. Giá trị **đã nằm sẵn trong scope** ngay chỗ ghi (`r.predErr.delta`) mà bị bỏ, nên **đại lượng đo chính** của việc theo dõi sai số dự đoán **không đọc được từ log**: với cứ **không va chạm** (delta nhỏ/0) không có scar → mất hẳn; với cứ va chạm chỉ lưu `expected`/`received` (nội dung), không lưu **giá trị** delta. **Một trường vào bản ghi đã có:** `ExpectationActivity` + `recordExpectation` thêm `delta`; [cycle.ts](src/loop/cycle.ts) truyền `r.predErr.delta`; serialize/deserialize + inspector (`err=`) cập nhật. Giờ sai số **mỗi** cứ thăm dò đều ở trong trace — bên thứ ba đo được **độ chính xác dự đoán theo thời gian**, không chỉ ramp confidence. Bỏ `signed` vì trên dòng này luôn `+` (âm/absence là của T7, ngoài vòng expectation). **2 test mới, fixture cập nhật, README refresh. 253 test, tsc sạch.** E2E: err ramp `0,0,1,0,1` qua run sun,sun,rain,rain,sun.

---

### — feat: CLI `dil` thật trên store đĩa — `bin` không còn trỏ vào barrel rỗng
**Commit:** `bc3aaa4`

`bin` trong package.json trỏ `dil` vào `./dist/index.js` — một barrel re-export thuần 43 dòng, **không shebang, không xử lý argv** — nên `npm install -g` tạo lệnh `dil` **không làm gì** (exit 0, kèm một `ExperimentalWarning` SQLite lạc lõng vì barrel kéo `node:sqlite`). Nó quảng cáo một lệnh **không tồn tại**. Dựng **cửa trước thật** — đúng mục đích của bộ máy conformance/audit: bên thứ ba đọc một `[event]` store lạ trên đĩa mà **không phải viết code**. Thêm [cli.ts](src/cli.ts) (entry thực thi nhỏ, tsc giữ shebang) ủy quyền cho `run(argv, out, err)` trong [cli-run.ts](src/cli-run.ts) — hàm **thuần, unit-test được**, trả exit code (`0` ok / `1` lỗi usage-hoặc-đường-dẫn / `2` verify-gãy). Ba lệnh **chỉ-đọc**, mỗi lệnh là vỏ mỏng bọc hàm đã export/đã test: `dil verify` (`verifyJsonlSink`), `dil inspect` (`inspectEventLog`), `dil conformance` (`renderConformance(checkConformance(...))`). Không mở sink ghi, không đụng gì (adapter log chỉ-đọc trên `readLogRecords`); import module cụ thể chứ không qua barrel → **không nạp `node:sqlite`, hết cảnh báo**. `conformance` báo trung thực **§13.2 Host = unverifiable** (không có gate từ store đĩa). `bin` nay trỏ `./dist/cli.js`; README có mục CLI. **11 test CLI (252 tổng), tsc sạch.**

---

### — docs: cập nhật README về đúng hiện trạng (số test, dòng `[event]` mới, công thức hash)
**Commit:** `c06e653`

Rà lại README sau các cải tiến gần đây, thấy **4 chỗ cũ** (chỉ docs): số test **233 → 241**; phần mô tả nhật ký `[event]` và ví dụ `inspectEventLog` **bỏ sót** hai loại dòng mới thêm — **crystallization** (§7) và **expectation** (INV-5) — đã bổ sung cả hai, và sửa số record mẫu (**46 → 44**, kiểm từ run 3-cycle thật); công thức hash-chain ghi `seq + prev + record` nhưng đã gồm `schemaVersion` từ 8f20041 — sửa thành `seq + prev + schemaVersion + record`, kèm ghi chú log tiền-versioning bị từ chối theo phiên bản (policy B). Số liệu conformance (4/3/0 ngắn, 6/1/0 dài) kiểm lại vẫn đúng.

---

### — fix: INV-1 `assertClosedLoop` không còn là check rỗng ruột (§5)
**Commit:** `ab04a91`

Check dead-branch thứ hai **rỗng ruột**: `sources` và `hasOutgoing` cùng được nạp từ **một `edge.from`** trong cùng vòng lặp → luôn là **hai set bằng nhau**, nên `!hasOutgoing.has(layer)` **không bao giờ đúng**. Chỉ mỗi ca `SINK` tường minh là thực sự bị bắt; một **dead-branch thật** — layer nhận output nhưng không có cạnh ra — **lọt qua** (`assertClosedLoop([{from:1,to:2}])` pass dù T2 dead-end). Doc cũ cũng tự mâu thuẫn ("a source with no outgoing edge" là bất khả — source luôn có cạnh ra). **Sửa:** dựng `sources` (from) và `targets` (to) thành **hai set khác nhau**, halt khi có target nào **không** là source — output của nó dead-end, không có đường về loop, đúng vi phạm INV-1. Cập nhật test "passes" thành cycle đóng thật (trước chỉ pass vì check rỗng — node 3 thực ra dead-end), thêm test cho ca dead-end mà code cũ bỏ lọt. Canonical 8-cycle và bắt SINK không đổi. **1 test mới (241 tổng), tsc sạch.**

---

### — fix: log `[event]` tiền-versioning bị từ chối nhất quán theo phiên bản (policy B)
**Commit:** `ed09544`

Ca biên tầng hash-chain (bên thứ ba báo, đã tự tái lập): 8f20041 vừa **đổi công thức băm** (thêm ô `schemaVersion`) vừa đóng dấu schema thẳng ở **2** trong một bước — nên mọi dòng ghi **trước** đó (kỷ nguyên tiền-versioning) **không có** `schemaVersion` và được băm theo công thức cũ *không có ô version*. `verifyChain` khi đó gãy ngay dòng 0 với lý do mơ hồ **"content break"**, như thể bị giả mạo. Tệ hơn: substrate lại **nâng claim** một store v1 lên v2 (policy A cũ) trong khi chain của chính store đó **không verify được** — trạng thái **incoherent** (claim bảo hợp lệ, gốc-tin-cậy bảo gãy). Cách "coi thiếu = v1" **không chạy** (đã kiểm: `hashChainEntry(...,1,...)` ≠ hash cũ) vì đây là đổi *công thức*, không phải thêm trường.

Xử lý bằng **policy B** (khai tường minh, HONEST STATUS, `SCHEMA_VERSIONED_SINCE` trong decisions.ts): log tiền-versioning nằm **ngoài** chuỗi versioned. `verifyChain` giờ từ chối dòng khuyết `schemaVersion` **theo phiên bản**, nêu rõ ranh giới (8f20041), không còn "content break". Và `claimSubstrate` **từ chối** store stamp dưới ranh giới ngay tại cửa (clean non-start), nên hệ **không bao giờ** nâng claim lên một log không verify được — **substrate và chain nay vẽ cùng một lằn ranh** (đây là câu trả lời cho mâu thuẫn substrate↔chain). Policy A (nhánh verifier dual-format vĩnh viễn) ghi nhận là phương án **bị loại**: chi phí bảo mật ~0 nhưng fork gốc-tin-cậy mãi mãi cho những store mà ở 0.1.0 (chưa user ngoài) chỉ là sản phẩm dev vứt đi; ranh giới là **một-lần** vì công thức đã đóng băng từ schema 2. Nếu sau này có user/store thật thì xét lại A trước 1.0 — đã khai rõ. **2 test mới/đổi (240 tổng), tsc sạch.** Repro gốc nay trả `ok:false` với lý do phiên bản.

---

### — feat: INV-5 accumulation đo được từ trace, không còn tự khai (§13.4)
**Commit:** `1c9ffaa`

Guard INV-5 ([assertAccrual](src/invariants/guards.ts)) **tự khai** (`kind: "accrue" | "load"` do người gọi khai) và **còn không được wire vào loop thật**; claim §13.4 "cycle-marks non-decreasing" là **proxy rỗng** mà một impostor reload cũng qua; confidence ramp có thật nhưng chỉ nằm trong bộ nhớ T5 + một unit test nội bộ — **bên thứ ba không đo được**. Đưa **hệ quả quan sát được** vào trace: một dòng `[event]` lean `expectation` mỗi (entity, cycle) mang `confidence` + `recurrence` (type `Expectation` thêm `recurrence`). §13.4 giờ **ĐO** chữ ký tích lũy từ các dòng đó — gom theo entity, đòi confidence **ramp theo recurrence tới bão hòa**; **recurrence reset**, hoặc recurrence tăng mà confidence (chưa bão hòa) **không tăng**, → **FAIL** đúng chữ ký reloading. Một impostor không bộ nhớ thì không có gì để làm hai con số leo, nên **không giả được ramp** trên hệ lạ chỉ từ trace. Thêm form serialize/deserialize + render inspector. §13.4 vẫn `partial` (self-continuity third-party vẫn cap), nhưng **bằng chứng INV-5 nay là trace-measured, không phải tin lời khai**. Ranh giới trung thực: đây đo *chữ ký* tích lũy, không chống kẻ ghi số giả vào log — đó là lớp toàn vẹn log (append-only + hash-chain). **6 test mới (239 tổng), tsc sạch.** E2E: `weather conf 0.00→0.33→0.67→1.00` theo recurrence 0→3, claim accumulation pass.

---

### — docs: sửa các tuyên bố status cũ phát hiện khi audit toàn repo
**Commit:** `6fbfd4c`

Audit một lượt toàn repo, thấy **3 chỗ doc lệch thực tế** (không có lỗi code): [README.md](README.md) status ghi "215 tests" → nay **233**; [AGENTS.md](AGENTS.md) nói test files "not yet authored" → **đã có** (`src/**/*.test.ts`, chạy bằng `pnpm test`, nay liệt kê trong khối lệnh); [inspector.ts](src/store/inspector.ts) gọi việc nối vào live daemon là "stage-5 work" → stage 5 đã build, reframe thành *standalone read-only view* mà deployment trỏ vào stores của daemon. **Đã kiểm chứng kèm:** build + 233 test sạch; DECIDE@IMPL tag A–H đều đã khai; một run đa nguồn đa dạng chấm **6 pass / 1 partial / 0 fail** đúng như README; git tree sạch (chỉ `.claude/settings.json`); không còn `layer_trace`/provenance-3-state mô tả sai; không có TODO/FIXME/HACK tồn đọng.

---

### — docs: dọn sạch mô tả `layer_trace` cũ trong comment source (v0.3.2 §6.1)
**Commit:** `ee396e8`

Nhiều comment trong `loop/` và `store/` vẫn mô tả datum **hiện tại** như thể còn "accruing a floor-tag and a layer_trace entry at each layer" và nhắc type `LayerTrace` **không còn tồn tại** — mâu thuẫn với thiết kế thật: path được ghi thành các dòng `layer-exit` gọn trong `[event]`, **không** nằm trên running-type field (v0.3.2 §6.1 đã drop `layer_trace`). Đã sửa: header của [cycle.ts](src/loop/cycle.ts), [layer.ts](src/loop/layer.ts), [layer.test.ts](src/loop/layer.test.ts) (floor-tag stamping + dòng `layer-exit` trong `[event]`, không có layer_trace); comment bước `runLayer`; danh sách borrowed-shapes ở [types.ts](src/loop/types.ts) + [index.ts](src/loop/index.ts) (bỏ `LayerTrace` ma); [resist-event.ts](src/store/resist-event.ts) (tối thiểu bảy tag = 4 fixed + ≥3 open, path nằm ở log); doc floor-tag ở [tags.ts](src/store/tags.ts). **Tiện thể** sửa một dòng kề cũng cũ ở tags.ts mô tả provenance là 3-state ("prior | running | scar") — từ v0.3.2 là **đồ thị 5-state** — và gỡ một field `layer_trace` sót trong object fixture của test. Chỉ comment + một field test chết; không đổi hành vi. **233 test, tsc sạch.**

---

### — feat: tách trace-verifiable khỏi structurally-guaranteed trong conformance (§13)
**Commit:** `93f7fb1`

§13 định nghĩa conformance = *"confirmable from traces alone"*, nhưng nhiều tiêu chí tựa một phần vào những sự thật **không đọc được từ `[event]`**: channel separation, đóng vòng INV-1, **vắng** action-arbiter, Mode-B không giữ store handle (đều *structural*), cộng reflection (*declared*) và self-continuity (*third-party*). Checker vốn **đã biết** các hạng này nhưng chôn trong văn xuôi của một `verdict` phẳng duy nhất → chữ PASS nói quá những gì trace chứng minh. Đưa hạng bằng chứng thành **first-class**: mỗi tiêu chí phân rã thành `claims`, mỗi claim mang `EvidenceBasis` (`trace | structural | declared | third-party`); **verdict cuộn lên từ claims** (claim `third-party` **cap ở partial**, không bao giờ pass). Bảng render thêm dòng **Evidence** (đếm claim theo basis + *bao nhiêu tiêu chí xác nhận được HOÀN TOÀN từ `[event]`* — ở đây **2/7**: §13.6, §13.7) và gắn basis mỗi claim, nên người đọc không nhầm một PASS *structural* với PASS *trace-confirmed*; auditor tính lại được "trace-only conformance" bằng cách lọc `basis === "trace"`. Giữ `verdict`+`detail` cuộn-lên (back-compat). **6 test mới (233 tổng), tsc sạch.**

---

### — feat: expose emission như năng lực ngang cho các layer (§6.4)
**Commit:** `18717a4`

Emission provenance đã được biểu diễn (`issuing_layer`, register ↔, một activity record) nhưng **capability chưa thực sự expose**: `process()` không nhận handle emit nào, nên chỉ driver phát, `issuing_layer` **hardcode = 8** trong mọi run. Đọc lại protocol §6.4 + spec gốc §6.1: emission là *"a capacity the loop exercises from many points"*, *"belongs to no single layer and is available to all"*, và là **tấm gương cấu trúc của GLOB-MOD** — field **giáng vào** `process` như nền, emission **phóng ra** từ đó (§6.1). §9 chủ định `issuing_layer` của *từng* emission, truy được về layer phát. Mở seam đúng theo đối xứng đó: `LayerSpec.process(input, field, emit)`; `runLayer` **bind issuing-layer = spec.index** (layer không tự khai issuer), **buffer** các emission layer khai rồi giao lại cho **một sink `emit` duy nhất của driver** ghi (layer **không bao giờ** chạm `[event]`). Giờ bất kỳ layer nào cũng có thể phát T2 probe / T3 query / T5 test / T6 model-test và được truy về đúng issuer. **Giữ honest scope:** host script tối thiểu **không** drive emission per-layer (không có region sống) → hành động duy nhất vẫn là response cuối ở T8 — *afford* năng lực, **không bịa** hành vi. **8 test mới (227 tổng), tsc sạch.** E2E: T5 phát → dòng `@T5 ↔`; host tối thiểu vẫn chỉ `@T8`.

---

### — feat: self crystallization như một state transition được kiểm chứng (§7)
**Commit:** `60a6696`

T2 đã phân loại agency (SELF_WRITTEN/ENV_PUSHED/UNDECIDED) nhưng chưa ghi **crystallization của self** — hành vi §7 — như một chuyển-trạng-thái kiểm được từ trace. Bổ khuyết: ghi **đúng mặt chữ §7** = *cái ACT vẽ ranh giới self/môi trường* tại T2 của cycle-0, **không** ghi self bền/stable (ghi giá trị stable sẽ gián tiếp khẳng định tính continue của self — điều §7 cấm). Cơ chế: T2 phát `crystallized` **chỉ ở lần chạy đầu** (`cyclesRun === 0`; T2 phục hồi mang `cyclesRun` tích luỹ → không tái phát — recovery *nối lại* một self-line, không tái-crystallize); cycle ghi **một** dòng `[event]` activityKind `crystallization` (lean: `datumId`+`cycleMark`+`t`, **không nhúng datum** — nên nó khẳng định *act*, không phải self bền). §13.4 kiểm: crystallization **một lần** và **tại cycle-0** → `partial` (continuity vẫn chỉ bên-thứ-ba quy được); >1 lần hoặc ≠cycle-0 → `fail`. Thêm form serialize/deserialize + render inspector. **9 test mới (223 tổng), tsc sạch.** E2E: đúng 1 crystallization ở cycle-0, §13.4 "crystallized once at cycle-0 … no persistent self is asserted".

---

### — feat: schema versioning — self-describing [event] log across schema changes
**Commit:** `8f20041`

Miền `provenance` đổi 3→5 ở v0.3.2, mà `[event]` bất biến (bản ghi cũ không sửa được), nên log trải qua đổi schema phải **tự mô tả**. Vá hai lỗ hổng: (1) `SCHEMA_VERSION` (=2, khai ở decisions) theo dõi schema store — đổi provenance 3→5 là version 1→2; (2) **mỗi dòng `[event]` được đóng dấu `schemaVersion`** viết dưới, **nằm trong hash-chain** (chống-giả-mạo) — reader diễn giải từng bản ghi theo version của nó, một log có thể chứa nhiều version sau một lần đổi. DIL-CLAIM `tagSchema` giờ lấy từ `SCHEMA_VERSION` (trước là hằng `1` stale, không bump khi Bước 3 đổi miền provenance). Claim-check **tiến hoá mềm (policy A)**: substrate stamp schema **cũ hơn** → chấp nhận + advance claim; schema **mới hơn** → từ chối (DIL cũ không ghi an toàn được); `protocol`/`layout` vẫn khớp tuyệt đối. 3 test mới (218 tổng), tsc sạch.

---

### — docs: declare EVENT_SYNC_POLICY (write-through fsync)
**Commit:** `293416c`

Khép đầu mối fsync: biến "residual" thành **lựa chọn DECIDE@IMPL khai báo** (kỷ luật dự án — mọi lựa chọn biểu diễn phải truy được về một khai báo). Sink fsync mỗi record (write-through) nên không mất gì khi crash — mặc định an toàn; gộp fsync/cycle dưới nhật ký dày là tuning throughput deployment-open, cố ý không build ở đây. Không đổi hành vi. 215 test, tsc sạch.

---

### — docs: consolidate AGENTS.md + README to v0.3.2 — migration complete (Bước 7)
**Commit:** `3364d09`

Bước cuối của migrate v0.2 → **v0.3.2 (hoàn tất)**. AGENTS.md: provenance là đồ thị 5-state (không còn chuỗi prior/running/scar); path đọc từ `[event]`, không từ tag (đã bỏ `layer_trace`); `[event]` là nhật ký dòng-hoạt-động (layer-exit/provenance/emission, mỗi emission mang `issuing_layer`); timestamp là wall-clock host, tách khỏi cycle-mark; respond là năng lực emission ngang (§6.4); thêm tag H vào danh sách DECIDE@IMPL. README: Status → migrated to v0.3.2, 215 test; store section viết lại (SQLite `[data]` trên chất nền requisition, `[event]` nhật ký hoạt động, provenance graph, timestamp wall-clock); quick-start sang đường **bền/requisition** (host.store.root, không tiêm store, auditor độc lập đọc từ đĩa); mục Deferred **Empty** (nội dung cũ đã ship), ghi rõ residual trung thực (cạnh scar-reentry có sẵn nhưng host tối thiểu chưa chạm điều kiện — emergence-by-condition, không phải chưa build). **Verify cuối:** tsc sạch, 215/215 test; daemon bền E2E (requisition + SQLite + JSONL trên đĩa) → auditor độc lập chấm **6 pass / 1 partial / 0 fail** với mọi §13 phản ánh v0.3.2. **Danh sách 7 tag DECIDE@IMPL (A–H) đều đã khai.**

---

### — feat: forward-building §6.2 + tag H — simulated/projected exercised (Bước 6)
**Commits:** `1c2d805` (6a on-ramps + tag H), `08ff982` (6b–d loop + appraisal + tests)

§6.2 forward-building, theo nguyên tắc tác giả chốt: **ta dựng con đường (cạnh + điều kiện lên cạnh), dữ liệu chạy đường nào là do *tình huống*** — hành trình emergent, không script. **6a:** khai DECIDE@IMPL **tag H** (`H_COUNT` số situation/cycle — trần, không quota; `FIT_MEASURE` = độ nhất quán với `[data]`, verdict-free, blend, *trên* appraisal nên INV-8 giữ), thêm on-ramp `toSimulated`/`toProjected` (validate cạnh §9). **6b–d:** sau T5, khi store có **vật liệu** (entity đã tích confidence) datum đi `running→simulated` (dựng ≤H_COUNT situation) `→projected` (cast = `Expectation.predicted`); fit = confidence, blend chọn; projected vào appraisal như InfoUnit **chưa va chạm** (§6.4, không thêm resistance). Return khớp → `projected→running`; va → `projected→scar`; datum không vật liệu → `running→scar` (reflex, §5/§8.7); cold start không forward-build. **`simulated`/`projected` giờ được đi tới thật, emergent.** §13.6 vẫn xanh, E2E 6 pass / 1 partial / 0 fail. 7 test mới (215 tổng), tsc sạch.

---

### — docs: fix ring diagram — INVARIANTS is the innermost ring
**Commit:** `c53e731`

Sơ đồ vòng ở CONTEXT.md §3 (và README.md) vẽ EXPERIENCE STORE trong cùng (nằm *trong* INVARIANTS), mâu thuẫn với "build from the inside out" + phần chữ "Invariants (innermost law)... write first" + thứ tự build thật (invariants stage 2 trước store stage 3; `store/tags.ts` import `LayerIndex` từ invariants). Đảo hai vòng trong cùng → nesting đúng `REQUISITION ⊃ LOOP ⊃ STORE ⊃ INVARIANTS`. Chỉ sửa docs; thứ tự build và code không đổi.

---

### — feat: Mode-B return-not-write — read-only [event] view, §13.5 (Bước 5)
**Commit:** `c78116f`

§8.4 "Mode-B returns; it does not write." Biến thành đảm bảo **ở mức type**: tách `ReadableEventLog` (`all`/`size`/`bySourceId`, **không `append`**) khỏi `EventLog`, và reflection reader giờ nhận `ReadableEventLog` — bên thứ ba đọc log để dựng reading nhưng type không cho ghi. `HostSource` vốn không có store handle (chỉ `next`/`deliver`, kênh E2), nên nguồn Mode-B **cấu trúc-không-thể** chạm `[data]`/`[event]`. §13.5 giờ báo cả hai vế mới: Mode-B không ghi store (structural, như channel separation) + returns **được đăng ký** chứ không để trôi (scar hoặc entity quan sát trong trace — loop chạy mà không đăng ký gì sẽ tụt partial = pure Mode-A). E2E không đổi (6 pass / 1 partial / 0 fail). 3 test mới (208 tổng), tsc sạch.

---

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

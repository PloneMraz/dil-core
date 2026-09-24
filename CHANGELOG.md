# Changelog

All notable changes to DIL are documented here, ordered newest-first.

---

## [Unreleased] — 2026-09-24

### 20:10 — feat: protocol v0.3.4, datum được viết ghi lại nó được dựng từ đâu
**Commit:** `c2c0cd2`

Plone duyệt hướng (2) và văn bản quy phạm. Mỗi datum mà agent viết, dù viết mới hay sửa, phải ghi **id của các datum mà nó được dựng từ**, không ghi nội dung. Đây là cùng một khái niệm protocol đã có ở `Expectation.built_from` và `Directive.built_from`.

- **`WriteRequest.builtFrom` là bắt buộc.** Nó liệt kê unit trong cửa sổ T5, unit đang thấy, hoặc id của datum được gợi lại. Nếu không dựng từ gì thì ghi `[]`.
- **Driver giữ một `WeakMap` nối unit với datum xuyên cycle.** Nó từ chối ngay id không tồn tại, unit không đến từ datum nào, hoặc lần viết không khai `builtFrom`.
- **Id được ghi vào mục `written` của cycle-seal.**
- **Checker (C6)** fail nếu datum được viết thiếu `builtFrom`, hoặc trỏ tới datum chưa có dấu vết lúc vào ở cycle đó.

Protocol lên v0.3.4, bằng `git mv`; đặc tả v7 giữ nguyên. Substrate claim `0.3.4`. Đột biến tắt phép kiểm thì test log giả mạo fail. **366 test xanh.**

---

### 19:15 — fix: mỗi record và mỗi datum lấy giờ đúng lúc nó xảy ra
**Commit:** `9073ddf`

Phát hiện khi chạy thật dil-arc3 với LLM nghĩ bên trong T5. Driver chỉ đọc đồng hồ **một lần mỗi cycle**, rồi đóng giờ đó lên mọi record và mọi datum trong cycle. Hệ quả:
- 17 phút LLM nghĩ ở T5 **không hiện ở đâu** trong `[event]`, vì mọi dòng của cycle đều mang giờ lúc cycle bắt đầu;
- chương trình được viết ở cuối cycle cũng mang giờ bắt đầu cycle.

Trong khi §9 yêu cầu log ghi mỗi chuyển đổi *"as it occurs"*, và timestamp của datum là lúc nó *"is first stamped"*.

Giờ các record sau lấy giờ **đúng lúc được ghi vào log**: layer-exit, provenance, emission, revision, expectation, resistance-reading, ResistEvent và directive. Phản hồi môi trường và datum được viết lấy giờ lúc vào `[data]`. Cycle datum giữ giờ bắt đầu cycle, và cycle-seal có thêm `closedAt`.

Test dùng đồng hồ giả, mỗi lần đọc tăng 1. Nó kiểm:
- thời gian nghĩ hiện ra giữa T4 và T5;
- datum được viết mang giờ sau lúc nghĩ;
- cycle-seal bao trọn các record của cycle;
- giờ không đi lùi theo thứ tự log.

Đã thử 2 đột biến đưa về giờ chung của cycle, và cả hai đều bị test bắt. **362 test xanh.**

---

### 18:50 — fix: scar được gợi lại chuyển trên đúng datum mà record nêu tên, và chỉ một lần
**Commit:** `dc7a9a7`

Lỗi này có từ `276f30a`, lúc scar được chuyển sang nằm trên datum phản hồi. Khi kênh `recollection` gợi lại một scar, driver vẫn ghi `scar → running` cho `cycle-N`. Nó ghi lại **mỗi lần gợi lại**, kể cả khi datum đã `running` rồi, và không hề cập nhật `[data]`.

Cách sửa:
- `RecalledFrom` giờ mang datum mà record nêu tên, và chỉ dùng `cycle-N` khi record không nêu datum nào.
- Driver chỉ chuyển datum khi nó thật sự đang là `scar`, và cập nhật `[data]` cùng lúc với dòng log.

Test của recollection giờ gieo cả `[data]` như một store thật vẫn giữ. Thêm 1 test: scar nằm trên datum phản hồi, chuyển trên đúng datum đó, và chỉ một lần. **358 test xanh.**

---

### 18:30 — fix: cycle datum chỉ thành scar khi thứ nó mang theo va chạm
**Commit:** `6c74f0c`

Xử lý việc trong hàng chờ, theo bốn quy tắc Plone đã duyệt:
1. Một outcome nó đã dự phóng va chạm: `projected → scar`.
2. Có dự phóng nhưng outcome đã dự phóng không va chạm: `projected → running`, kể cả khi một phản hồi khác va chạm.
3. Absence, tức va chạm không có datum phản hồi riêng: cycle datum đứng thay, `→ scar`.
4. Không có dự phóng mà một phản hồi va chạm: cycle datum giữ `running`.

Quy tắc 3 được áp dụng cho mọi va chạm không có datum phản hồi riêng, gồm absence, phản hồi host không nhận vào, và thứ đến từ store. Lý do là scar record phải chứa một datum mang tag `scar`.

**Để ngỏ:** va chạm của thứ đến từ store (datum được gợi lại hoặc do agent viết) vẫn do cycle datum đứng thay, không nối với datum riêng. Nếu nối thì lần một datum được sửa quay về, lệch với kỳ vọng "không đổi" của persistence, sẽ bị gắn scar, dù đó là thay đổi SELF_WRITTEN.

Số ResistEvent và scar record không đổi; chỉ provenance của cycle datum đổi. README không còn việc nào trong hàng chờ. Có 5 test mới trong `cycle-scar.test.ts`. Khi đột biến về quy tắc cũ, đúng 2 test ứng với quy tắc 2 và 4 fail. **357 test xanh.**

---

### 17:40 — feat: migrate code lên protocol v0.3.3: `nascent`, cửa vào theo nguồn, `write`, `revision`
**Commit:** `44309b7`

**Rule dự đoán có thêm hàm `write`:**
- **Viết mới** (không kèm `datumId`): datum đi qua tagging-gate, vào ở `nascent` và mang cycle-mark của cycle viết ra nó.
- **Sửa** (kèm `datumId`): nội dung đổi, provenance giữ nguyên, và `[event]` có một dòng `revision` không mang nội dung.

Trong cả hai trường hợp:
- bộ tag của datum được ghi vào activity record, mục `written`;
- sang cycle sau, datum đến qua T1, T2 đọc lần viết là của chính agent (SELF_WRITTEN), và datum chạy hết các tầng;
- với datum `nascent`, lúc đó nó chuyển `nascent → running` và giữ nguyên cycle-mark.

**Phản hồi của môi trường và cycle datum** vào thẳng `running` qua `admitArrival`, nên không còn dòng `prior → running` cho chúng.

**Cue có thể mang `provenance`,** nên rule hỏi được "những gì đã va chạm", ví dụ `{kind: frame, provenance: scar}`.

**Checker:**
- chấp nhận cạnh `nascent → running`;
- mỗi cửa vào chỉ được đi qua một lần;
- datum rời `nascent` phải có tag trong record của cycle đã viết nó;
- datum được viết phải chạy đủ T1 tới T8 ở cycle sau;
- **datum nào chạy hoặc bị sửa mà không có dấu vết lúc vào thì fail.**

**Phiên bản:** tag schema 2 → 3, protocol claim 0.3.2 → 0.3.3. Substrate đòi `protocol` khớp chính xác, nên store claim dưới 0.3.2 bị từ chối. Riêng việc tăng schema thì substrate vẫn chấp nhận: lúc lập kế hoạch em đã nói nhầm chỗ này.

7 test cũ được sửa theo ý định ban đầu của chúng. Một ví dụ: test "vào `prior` hai lần" trước đây dựa vào dòng `prior → running` sẵn có của cycle datum, nên giờ phải tự chèn đủ hai dòng. Thêm 8 test trong `write.test.ts`. Đã thử 2 đột biến (bỏ hành động write khỏi thứ T2 đọc; tắt phép kiểm dấu vết lúc vào), và cả hai đều bị test bắt. **352 test xanh.**

---

### 16:55 — docs: protocol v0.3.3 và đặc tả v7: `nascent`, cửa vào theo nguồn, sửa datum
**Commit:** `f8230de`

Plone duyệt từng điểm. Hai file được đổi tên bằng `git mv` để giữ lịch sử.

- **Thêm vị trí provenance `nascent`** cho datum mà agent viết mới hoàn toàn. Nó mang cycle-mark của cycle viết ra nó. Sang cycle sau, nó đến qua T1, được T2 gắn SELF_WRITTEN, chạy hết các tầng, rồi đi `nascent → running`. `prior` và `nascent` là hai cửa vào một chiều; bốn vị trí còn lại vẫn xoay vòng như cũ. Định nghĩa ghi rõ `nascent` nói về nguồn gốc của datum, không phải một phần của self (§7). Tên này được chọn để tránh nhầm với nhãn SELF_WRITTEN/ENV_PUSHED ở T2.
- **`prior` được giữ đúng định nghĩa của nó:** dữ liệu host có sẵn trước khi vòng lặp chạy. Phản hồi của môi trường và cycle datum đi qua tagging-gate rồi vào thẳng `running`, và được phân biệt bằng `domain`. Mọi lần vào đều phải ghi bộ tag vào `[event]`.
- **Sửa một datum đang giữ không phải là đưa datum mới vào:** nội dung đổi, provenance giữ nguyên. T2 gắn SELF_WRITTEN cho thay đổi đó, và `[event]` có một dòng ghi lại việc sửa, không mang nội dung. Nội dung cũ đọc từ snapshot của commit; độ mịn tùy nhịp commit, là `DECIDE@IMPL`.
- **Hợp đồng T1** nói rõ phản hồi của môi trường vào store ở `running`.
- **§6.4:** store trả lời một query bằng những gì nó đã có trước cycle đặt câu hỏi.
- **§13 C6** áp dụng cho mọi lần vào và mọi lần sửa.
- Mục `Changes-in-v0.3.3` yêu cầu: *"an implementation that versions its stored tag schema MUST bump that version"*.

AGENTS.md, CONTEXT.md và README.md giờ trỏ tới file mới. Code vẫn theo v0.3.2 cho tới khi migrate xong; README đã ghi rõ điều này.

---

### 16:20 — docs: ghi hàng chờ, cycle datum có còn thành scar không
**Commit:** `c413f34`

Mục "Deferred" trong README trước đây ghi trống. Giờ nó có một việc: từ `276f30a`, phản hồi của môi trường là datum chuyển sang `scar`, nhưng cycle datum *cũng* vẫn thành `scar` mỗi khi có va chạm. Với absence thì chỉ có cycle datum để gắn. Còn khi đã có phản hồi thật sự va chạm, việc cycle datum cũng thành scar có thể là thừa. Sửa chỗ này sẽ đụng tới forward-building, nên để sau (theo thống nhất với Plone).

---

### 15:55 — fix: dữ liệu môi trường trả về là datum, và scar nằm trên nó
**Commit:** `276f30a`

Trước giờ driver **không coi thứ môi trường trả về là dữ liệu**. Mỗi chu kỳ chỉ có một datum là cycle datum do driver tự tạo, với payload là số tín hiệu. Hễ có va chạm là chính cycle datum đó bị gắn `scar`. Tức là tag `scar` nằm trên một bộ đếm, còn mismatch thì không biết mình lệch so với cái gì. §3 định nghĩa: *"A `scar` has collided with resistance and held"*. Nếu thứ được đem ra so với kỳ vọng không phải là datum, thì tag không có chỗ để gắn.

Giờ mỗi thứ môi trường trả về:
- đi qua tagging-gate vào `[data]` dưới id `signal-<cycle>-<i>`;
- chạy như `running` và để lại dòng log ở mọi tầng nó rời;
- ghi bộ tag (không ghi nội dung) vào activity record, mục `admitted`;
- khi kỳ vọng về nó lệch thì **chính nó** chuyển `running → scar`, và scar record chứa nó kèm `datumId`.

Host khai báo tag qua `AdmitPolicy`. Mặc định `admitReturn` giữ mọi thứ, gắn `domain: region`, `source`, `format`. Cycle datum vẫn đại diện cho cả chu kỳ, và cho absence, vì ở đó môi trường không trả về gì.

Store query giờ **chỉ trả lời bằng những gì store đã có trước chu kỳ đặt câu hỏi**, nên thứ vừa đến không bị gợi lại như trí nhớ của chính nó. Checker kiểm đường đi của các datum này (C3) và việc chúng vào qua cổng (C6). Checker cũng đọc flow mode từ cycle-seal, vì flow mode là thuộc tính của chu kỳ.

Đã thử đột biến: bỏ dòng loại trừ ra thì test về trí nhớ fail. **344 test xanh.**

---

### 15:14 — feat: rule dự đoán tự hỏi store thứ nó còn thiếu
**Commit:** `1e2d826`

Trước giờ **chỉ T3 hỏi được store, và chỉ hỏi về thứ vừa đến**. Trong khi đó, phần của vòng lặp biết mình đang thiếu gì là rule dự đoán ở T5, nơi tư duy nằm, lại không có đường nào để tìm tới trí nhớ. Nó chỉ nhận những gì được đưa tới.

§6.4 đã có sẵn đường cho việc này: *"emission is a lateral capability any layer MAY invoke: when a layer's own work requires pushing to the region — to obtain what it lacks"*. Giờ T5 trao cho rule một hàm `ask(cue)`. Hàm này **chỉ phát được store query, không phát được gì khác**: rule chọn thứ nó cần đọc, nhưng vẫn không hành động, và một kỳ vọng không bao giờ trở thành một lựa chọn. Query này là một emission như mọi emission khác:
- register ↔;
- một activity record ghi T5 là tầng phát;
- câu trả lời đến T1 ở chu kỳ sau và chạy qua mọi tầng.

Vì vậy những gì rule đã đọc đều nằm trong dấu vết. Không có hằng số nào đếm hay giới hạn số lần rule hỏi.

Test kiểm năm điều:
1. Query của rule được ghi với T5 là tầng phát.
2. Câu trả lời tới được rule ở chu kỳ sau.
3. Datum được hỏi chuyển sang `running`.
4. Datum không được hỏi vẫn ở `prior`.
5. Bộ kiểm không đánh fail claim nào.

**336 test xanh.**

---

## [Unreleased] — 2026-09-23

### 17:33 — fix: datum được gọi lại để lại đường đi và bộ tag của chính nó trong log
**Commit:** `d358902`

Đọc log của một lượt chạy thật: **960 dòng layer-exit, và cả 960 đều thuộc datum chu kỳ.** Một datum được gọi lại từ store đã đi T1..T8 mà không để lại dòng nào. Floor-tag của nó đứng yên ở tầng nhận vào, và tag của nó chỉ nằm trong `[data]`, thứ sửa được. §9 đòi *"every layer a datum exits MUST be recorded"* và không có tầng đi xuyên. §13.6 đòi bên thứ ba xác nhận từ dấu vết rằng *"host data entered only via the tagging-gate"*.

Giờ mỗi lần datum được gọi lại rời một tầng, log ghi một dòng dưới id của chính nó, và floor-tag của nó được đóng theo tầng vừa rời. Activity record của chu kỳ mang **bộ tag đầy đủ** của nó (fixed và open): **chỉ tag, không bao giờ có nội dung**. Activity record là dấu vết, không phải trải nghiệm, và §9 giữ dấu vết đầy đủ *"without letting uncontested information into the agent's memory"*. Chu kỳ không gọi lại gì thì ghi y hệt trước.

Bộ kiểm đọc được cả hai điều. Đường đi của datum được gọi lại phải phủ T1..T8 trong chu kỳ nó chạy (C3). Mọi datum rời `prior` phải có một bộ tag hợp lệ với gate trong activity record của chu kỳ đó (C6, §13.6). Datum nào rời `prior` mà trong log không có tag thì bị đánh fail. **333 test xanh.**

---

### 16:22 — fix: T2 đọc mọi emission, nên kết quả của một query khép vòng về đúng nó
**Commit:** `9b0bbdf`

§6.4 luật 3: mọi hành động đã phát *"MUST be readable by T2 at the next cycle as 'the action just emitted', closing the path: emit → region returns → T1 ingests → T2 matches"*. T2 trước giờ **chỉ thấy nước đi cuối chu kỳ**, nên một query của T3 không bao giờ được đọc lại, và thứ nó mang về chỉ có thể bị xếp là do môi trường đẩy vào.

Giờ T2 nhận thêm các hành động mà các tầng đã phát phụ ở chu kỳ trước. Mỗi kết quả trả về từ store đến như một thay đổi quan sát được, **có giá trị là chính query đã gọi nó**. T2 khớp hai thứ đó và xếp kết quả là `SELF_WRITTEN`: chính query của tác tử đã tạo ra nó. Nội dung thì **vẫn không phải của tác tử**. Agency và provenance là hai câu hỏi khác nhau.

Transducer giờ cũng có thể mô tả một tín hiệu là **nói về nhiều thứ** (một danh sách mô tả). T3 hỏi về từng mô tả mà nó chưa hỏi. **328 test xanh.**

---

### 16:08 — feat: T3 hỏi store của chính tác tử, và một `prior` được gọi lại thì chạy
**Commit:** `5bb031a`

**Dữ liệu `prior` được nhận vào rồi không ai hỏi tới.** Dữ liệu host qua tagging-gate được đóng tag `prior` rồi nằm yên trong `[data]`, nên không bao giờ chạy và không bao giờ đi cạnh `prior → running` mà §9 định nghĩa. Đây là **lần thứ sáu** cùng một khuôn: một kênh có mặt trong topology mà không ai rút điện.

Cơ chế đã có sẵn trong đặc tả. §6.4: *"T3 emits a query: it opens or calls a channel to ingest actively"*, và §6 liệt kê *query returns* trong đầu vào của T1. Giờ T3 làm đúng việc đó. Transducer của một kênh có thể mô tả thứ vừa đến theo các chiều open tag mà host khai (§9 lớp open, tag F). T3 hỏi store bằng chính mô tả ấy, **mỗi mô tả chỉ hỏi một lần**. Store trả về mọi datum có open tag mang đủ các cặp của cue. Câu trả lời vào ở T1 chu kỳ sau và đi qua đủ các tầng như mọi thứ khác. Datum được gọi lại đi `prior → running` đúng lúc đó, nhận cycle-mark của chu kỳ ấy, và bước đi được ghi vào `[event]`. **Index chính là lớp open tag**, dùng đúng như §9 đã đòi; không thêm gì vào tag schema.

Trí nhớ được **gọi lại theo gợi ý, không tràn vào**: thứ không cue nào khớp thì nằm yên, cue đã hỏi thì không hỏi lại. T7 cũng thôi ghi vắng mặt cho datum được gọi lại ở những chu kỳ không ai hỏi nó. Đo trước khi sửa: host không báo presence thì datum ấy bị ghi vắng mặt mọi chu kỳ từ chu kỳ thứ hai. Host không mô tả gì thì hành vi giữ nguyên. **326 test xanh.**

---

### 05:02 — fix: T8 đóng vòng trở lại thay vì đổ vào bồn chứa
**Commit:** `a1914f3`

**Không ai đọc đầu ra của T8.** `relValues` và `socialEdges` được sinh ra mỗi chu kỳ rồi bị bỏ, nên đỉnh của meaning-channel là một **nhánh chết** — trái INV-1 (*"every layer output MUST have a path back to some layer's input"*) và trái §6.2, vốn nói thẳng *"T8 closes back into the loop, **not into a sink**"*.

Meaning-channel không mang đầu ra của T8 xuống được — INV-3 cấm. **Trường thì mang được**, và có hiệu lực từ N+1. Nên T8 giờ góp hai sự việc **chỉ nó thấy**: có bao nhiêu tương tác Other↔Other nó ghi nhận (`interactions`), và kháng lực **dồn tới đâu** giữa các Other nó xếp hạng (`resistanceConcentration`) — bằng 1 khi một Other làm toàn bộ việc kháng cự, bằng 1/N khi trải đều, bằng 0 khi chưa có gì kháng cự.

Đây là **lần thứ năm** cùng một khuôn trong bản cài đặt này: một kênh có mặt trong topology mà không ai rút điện. **316 test xanh.**

---


### 04:32 — ci: đổi nhánh mặc định sang `main`, và CI chạy theo nó
**Commit:** `d7e1755`

Nhánh mặc định đổi tên từ `master` thành `main`, cho khớp quy ước của mọi repo khác do tài khoản này tự tạo. Việc đổi tên làm trên GitHub, nên tên cũ được tự chuyển hướng và nhánh mặc định được cập nhật luôn.

Chỗ phụ thuộc duy nhất vào tên nhánh là trigger của CI (`on: push: branches: [master]`), và đó là một cái bẫy **im lặng**: trigger trỏ tới một nhánh không còn tồn tại thì không báo lỗi, nó chỉ **không bao giờ chạy nữa**, trong khi pull request vẫn chạy bình thường. Nên trigger được sửa cùng lúc, và **chính lần đẩy bản sửa đó là phép kiểm chứng**: CI đã chạy trên `main` (run `35831990929`, `push`, **success**) thay vì được giả định là sẽ chạy.

Các dòng nhắc `master` trong những mục CHANGELOG cũ là lịch sử, được giữ nguyên.

---


### 04:10 — docs: ghi đúng tên model đang làm việc trong Commit Format
**Commit:** `ed065dc`

Trailer đồng tác giả trong [AGENTS.md](AGENTS.md) ghi `Claude Opus 5 (1M context)`. Model làm việc đã chuyển sang **Opus 5.5**, mà trailer là một **khẳng định về ai đã viết mã** — ghi sai model, dù chênh lệch nhỏ, vẫn là ghi sai tác giả. Giờ dòng đó ghi `Claude Opus 5.5`.

Mục CHANGELOG cũ ghi lại lần sửa trước (Opus 4.8 → Opus 5) là **lịch sử**, được giữ nguyên như đã viết.

---


### 03:38 — feat: luật dự đoán báo được lên trường
**Commit:** `ece454d`

Chỗ nào host đặt model, thì **model là thứ duy nhất đọc tình huống đủ gần để nói được điều gì về nó** — mà **một luật không phải một tầng**, nên nó hình thành được kỳ vọng và **không báo được gì**. Lý giải của nó về tình huống của chính nó bị **tính rồi vứt đi**.

`PredictRule` giờ nhận `contribute`, kênh đi lên trường, **gắn vào T5** vì chính luật do T5 khai đã tạo ra đóng góp đó. Luật không có gì để báo thì **bỏ tham số**, nên `persistence` không đổi.

`attentionWidth` giờ tổ hợp **sự việc thứ ba**:

```
(1 + strangeness + contextNovelty) / max(1, otherCount)
```

`strangeness` là **cái mới của THỰC THỂ**, `contextNovelty` là **cái mới của TÌNH HUỐNG** — một host có thể có đầy cái thứ hai và **không có** cái thứ nhất, và host đã đo đúng là như vậy: nó **luôn biết** mình vừa dùng affordance nào, nên `strangeness` bằng 0 **mãi mãi**, còn cái mới của tình huống thì biến thiên.

Động cơ là **một phép đo, không phải sự đối xứng**: truy vết trên game sống, trường giữ **hai hằng số và ba đại lượng phẳng từ chu kỳ 8**. Nó gần như không có ngữ cảnh để tổ hợp, và **thứ duy nhất biết ngữ cảnh thì nằm ở phía bên kia khe này**. **313 test xanh.**

---

### 03:12 — feat: chú ý là TỔ HỢP của những gì trường đang giữ, không phải công thức của một tầng
**Commit:** `5ade036`

T6 tính `1/N` rồi đóng góp **câu trả lời** — điều đó biến chú ý thành **hằng số của một tầng đơn lẻ**. Nó không phải vậy: chú ý là **thứ cả trường đang giữ**, tổ hợp từ những **sự việc** mà từng tầng báo lại từ chỗ đứng của riêng nó.

Nên mỗi tầng giờ góp **đúng sự việc chỉ nó thấy được**, **trọng số 1 đều nhau**, và **không quyết định gì** về hệ quả:

| Tầng | Khóa | Sự việc |
|---|---|---|
| T3 | `channelActivity` | vùng vừa nói bao nhiêu trong chu kỳ này |
| T4 | `strangeness` | tỉ lệ thứ đến mà **không buộc được** vào thực thể nào |
| T5 | `surprise` | vùng lệch khỏi kỳ vọng bao xa, **ngay lúc này** |
| T6 | `otherCount` | đang **GIỮ** bao nhiêu Other (tích lũy) |
| T7 | `silence` | bao nhiêu thứ được chờ mà không tới |

Rồi T7 **đọc độ rộng ra từ tổ hợp** chứ không đọc một con số ai đó đưa sẵn:

```
attentionWidth = (1 + strangeness) / max(1, otherCount)
```

Chú ý **hẹp lại khi vòng lặp giữ nhiều hơn**, và **rộng ra khi thứ đến thôi quy được về đâu** — tình huống lạ xứng một cái nhìn dài hơn, tình huống đông mà quen thì không. **Cả hai đầu vào đều là sự việc từ ngữ cảnh và môi trường, không phải núm điều chỉnh** — đó là toàn bộ điểm của thay đổi này.

Tổ hợp vẫn là khai báo được và chỉnh được, và **trường rỗng tổ hợp ra 1**, nên host không báo gì thì hành vi tham chiếu không đổi. `ATTENTION_GAIN` vẫn nhân thêm cho host nào muốn nói thẳng.

T7 đọc hai khóa kia bằng **hằng chuỗi cục bộ** chứ không import từ T4 và T6, nên nó **không tạo phụ thuộc meaning-channel** lên chúng (INV-3): trường là kênh xuống và không mang ràng buộc kiểu đó. **313 test xanh.**

---

### 02:41 — fix: độ rộng chú ý do T6 đặt, không phải T8
**Commit:** `8c22b10`

T8 nhận việc này trước, và **nó không chạy**. T8 xếp hạng các Other **có mặt trong chu kỳ này**, mà `input.others` chỉ mang đúng những cái đó — nên ở host mà mỗi chu kỳ chỉ một thực thể trở về, T8 thấy **N = 1 mọi lần** và độ rộng không bao giờ nhúc nhích. Đo trên lượt chạy `ls20` thật: **gain đứng yên ở 1.0 suốt cả 80 chu kỳ** trong khi bốn affordance đang được giữ. Thiết kế sai, và **phép đo là thứ bắt được nó** — không phải suy luận.

"Vòng lặp đang giữ bao nhiêu Other" là kiến thức **tích lũy**, và T6 là tầng tích lũy nó: nó chính là Other-Model Synthesis, toàn bộ trạng thái của nó là một map các Other đã gặp. Nên đóng góp chuyển về đó và đọc `state.size`.

Có test ghim: bốn thực thể, mỗi chu kỳ **chỉ một cái** trở về, và gain ra `1/4` chứ không phải `1`. Docstring của T8 giờ ghi lại **vì sao nó không phải tầng đúng**, để việc này không trôi ngược về.

Đo lại sau khi sửa, trên `ls20` (T6 tích lũy 5 thực thể → gain 0.2):

| span khai báo | hiệu dụng | absence | kháng lực thật |
|---|---|---|---|
| ∞ | ∞ | 225 | 2 |
| 8 | 1.6 | 76 | 2 |
| **4** | **0.8** | **3** | **2** |
| 2 | 0.4 | 1 | 2 |

**225 → 3** ở span khai báo bằng 4, C3 vẫn sống, và cột kháng lực thật **vẫn không đổi ở mọi mức**. **311 test xanh.**

---

### 02:19 — feat: kênh đi LÊN của GLOB-MOD, và T8 đặt độ rộng chú ý
**Commit:** `bff8987`

INV-7 viết: *"**Every layer contributes** to it as one competing parameter; contributions blend, re-weighted each cycle, **never last-write-wins**."* Thực tế: **không tầng nào đóng góp được.** `process` nhận `field` và `emit`, hết; người gọi `glob.contribute` **duy nhất** trong toàn bộ bản cài đặt là **driver**, một lần mỗi chu kỳ, với một khóa cứng ở trọng số cứng.

Với đúng một người đóng góp thì **mọi mệnh đề của câu đó đều rỗng**: *"every layer contributes"* — sai; *"one competing parameter"* — không có gì cạnh tranh; *"blend, never last-write-wins"* — vô nghĩa, vì **một** đóng góp đem trộn **chính là** lần ghi cuối. Cỗ máy blend đã tồn tại, đã có test, và **không ai với tới được**.

`ContributeFn` là **chiều thứ ba** một tầng có thể chuyển động, đối xứng với hai chiều kia: `field` **xuống** như nền chỉ-đọc, `emit` **ra** vùng, `contribute` **lên** trường. Như emission, nó được `runLayer` **gắn vào chỉ số của chính tầng đó**, đệm lại, rồi trao cho driver — tầng không bao giờ tự khai chỉ số và không bao giờ chạm thẳng vào GLOB-MOD.

Nó **không phá INV-3**, vốn chỉ chi phối meaning-channel. §5 nói rõ: *"when an upper layer alters GLOB-MOD it changes the field, which then conditions every layer from above"*, và việc điều kiện hóa vẫn chỉ xảy ra ở **N+1**. Có test khẳng định đúng thời điểm đó.

**Rẻ hơn ước lượng:** TypeScript cho phép hàm ít tham số thỏa chữ ký nhiều tham số, nên **bảy tầng không cần `emit` lẫn `contribute` thì không phải đụng tới**. Chỉ các chỗ gọi thẳng `process()` trong test mới cần thêm đối số. (Ước lượng ban đầu — *"đụng cả 8 tầng"* — là sai và đã sửa.)

**T8 là người dùng đầu tiên.** Nó là tầng duy nhất nhìn thấy **có bao nhiêu Other cùng lúc**, nên cũng là tầng duy nhất nói được chú ý đang bị **dàn mỏng tới đâu**: nó đóng góp `attentionGain` **nghịch với N**, vì *chú ý tới bốn thứ không phải là chú ý tới một thứ bốn lần*. T7 đọc con số đó thành "thực thể ở lại trong kỳ vọng bao lâu", nên **span không còn phải dò tay theo từng host**. Gain trơ nếu host không khai span hữu hạn — Infinity nhân gì cũng là Infinity — nên host im lặng vẫn giữ hành vi tham chiếu.

Và một test **cuối cùng cũng chạy được** mệnh đề blend với **hai** người đóng góp cùng đặt một khóa: kết quả là **trung bình có trọng số**, không phải cái chạy sau. **310 test xanh.**

---

### 01:52 — feat: chú ý trên tình huống — trường nâng sàn fit
**Commit:** `bebc412`

Nửa sau của chú ý, và là **nửa an toàn**. Forward-building trước nay lấy **bất cứ thứ gì kho ủng hộ** (`confidence > 0`) làm vật liệu. Giờ trường nâng được sàn đó lên, nên vòng lặp chỉ dựng từ cái nó **được ủng hộ mạnh** — chính là việc chọn lọc mà `H_COUNT` vốn đã làm, nay có thêm **sàn dưới** bên cạnh **trần trên**.

Hai cách đọc hiển nhiên hơn của *"gác kỳ vọng bằng ngưỡng confidence"* **đều không an toàn**, và em xác định bằng cách kiểm mã chứ không bằng trực giác:

- **Cho trường co giãn `Expectation.confidence`** sẽ **phá §13.4**. Con số đó được ghi vào `[event]`, và bộ kiểm tra conformance **đánh trượt** lượt chạy nào có *"confidence did not rise though recurrence climbed"*, gọi đó là **chữ ký kẻ nạp lại** của INV-5. Một gain chú ý đang co lại sẽ khiến một vòng lặp tích lũy **lành mạnh** bị báo là giả mạo. Có test khẳng định chuỗi `(recurrence, confidence)` ghi ra **giống hệt nhau** dưới sàn cao và sàn thấp, và rằng nó **thật sự là một đường dốc lên**.
- **Bỏ qua thực thể có confidence thấp ở T5** nghĩa là không có kỳ vọng → không có `PredErr` → **kháng lực của hồi đáp đó không được đăng ký**, đúng định nghĩa Mode-A thuần của §8.2, cài đặt có chủ ý. Có test khẳng định: dưới một sàn cao đủ để chặn sạch forward-building, một hồi đáp trái ngược **vẫn sinh ra vết sẹo** gắn đúng thực thể đã kháng cự.

Nên sàn chỉ chạm vào **cái được DỰNG TIẾP từ đó**. Mọi thực thể vẫn có kỳ vọng, mọi hồi đáp vẫn gặp kỳ vọng của nó, mọi lệch vẫn được đăng ký, và `confidence` vẫn là **hàm thuần của tích lũy**.

`FIT_FLOOR` mặc định 0, nên hành vi tham chiếu không đổi. **300 test xanh.**

---

### 01:26 — feat: chú ý ở T7 — vòng lặp thôi đòi lại mọi thứ
**Commit:** `3134990`

Kỳ vọng trước nay **phẳng**. Mọi thực thể từng thấy đều bị kỳ vọng trở về mỗi chu kỳ, **vĩnh viễn**, vì không chỗ nào trong vòng lặp có khái niệm *đang chú ý tới cái gì*. Với một thực thể thì điều đó vô hình; với N thực thể mà mỗi chu kỳ chỉ một cái trở về thì đó là **N−1 vắng mặt giả mỗi chu kỳ**. Đo trên host thật: **444 trong 481 vết sẹo** là loại vắng mặt đó. Vòng lặp không phân biệt nổi *"đã im lặng"* với *"đang không được chú ý"*.

Hành vi cũ giờ được **ghi thành test** thay vì giả định, gồm cả vòng tròn bốn thực thể sinh ra ba vắng mặt mỗi chu kỳ.

Hai cổng, **cả hai cộng thêm và có mặc định**, nên host không khai gì thì hành vi tham chiếu không đổi:

- **`T7Input.present` — lời của vùng.** Thực thể mà vùng nói là không có ở đó thì không im lặng, chỉ là không có mặt. *Im lặng giả định phải có cơ hội lên tiếng.* Được luồn từ `HostCycleInput` qua `gatherT7` như **host ingest**, giống T1 và T3, nên INV-3 không dính vào. (Port ngược từ `dil-arc3`, vì lỗi nằm ở thượng nguồn.)
- **`attentionSpan`, nhân với `attentionGain` của trường — lời của trường.** Thực thể mà vòng lặp không còn hướng tới thì không bị chờ đợi.

**Đây là tầng ĐẦU TIÊN trong dil-core thật sự đọc trường điều biến.** Trước đó mọi `process()` đều *nhận* `field` và **không tầng nào dùng** — T4 và T5 còn không khai tham số — nên lý do của INV-7 chỉ đúng tại bước appraisal. Một test cho thấy hai T7 có **lịch sử tích lũy giống hệt nhau** lại kỳ vọng khác nhau dưới hai trường khác nhau, đúng nghĩa câu *"Same data plus a different field yields different meaning."*

**Lằn ranh chú ý không được vượt** là của §8.2: vòng lặp *"lets the external returns go unregistered"* chính là Mode-A thuần, và một cổng chú ý chặn hồi đáp sẽ **là** thất bại đó, được cài đặt có chủ ý. Nên cổng này chỉ chạm vào **cái bị ĐÒI LẠI**. Có test giữ: thực thể ra khỏi chú ý năm chu kỳ, khi trở về **vẫn được đăng ký**, và được kỳ vọng lại ngay chu kỳ sau.

**Khai rõ, rút từ phép đo:** `span = 0` sẽ xóa sạch cơn lũ, và **cố ý không chọn**. §8.1 **C3** đòi phát ra missing-InfoUnit khi một sự kiện được kỳ vọng không xảy ra, mà vòng lặp không kỳ vọng gì thì **trượt C3 do cấu tạo**. `span = 1` cắt vòng tròn từ ba vắng mặt xuống một. **Chú ý thu hẹp kỳ vọng; nó không được thủ tiêu kỳ vọng.**

Cũng là lựa chọn có chủ ý: snapshot cũ (chưa có `lastSeen`) phục hồi thành **vẫn đang chú ý**, không phải ngoài chú ý — phục hồi không được lặng lẽ thu hẹp cái vòng lặp kỳ vọng.

`tsc --noEmit` sạch, **294 test xanh** (282 → 294).

---

## [Unreleased] — 2026-09-23 (tiếp)

### 00:41 — feat: kênh truy hồi kháng lực — cuối cùng thì kho cũng trả lời
**Commit:** `8455418`

§9 đặt kho làm chỗ ngồi của kinh nghiệm — *"The self accrues from scars"* — và §10 buộc kho riêng phải mang kênh truy hồi kháng lực, *"otherwise drift is certain"*. **Cả hai điều khoản trước nay không được thỏa ở đâu cả.** Không thành phần nào trong vòng lặp đọc kho: [cycle.ts](src/loop/cycle.ts) gọi `data.put` một lần mỗi chu kỳ và không bao giờ đọc lại, nên sẹo được ghi ra rồi không bao giờ trở về, và ba cạnh §9 định nghĩa cho sự trở về đó — `scar → running`, `scar → simulated`, `scar → projected` — **không thể phát**. Đo trên một lượt chạy thật: cả ba đều 0 lần.

Luật cập nhật của [T5](src/loop/layers/t5.ts) trở thành khe khai báo được, với `persistence` làm mặc định nên hành vi tham chiếu không đổi khi host không khai gì. [recollection.ts](src/loop/recollection.ts) là kênh đó: nó nhận `ReadableEventLog` và **không gì khác**, nên *"Mode-B returns; it does not write"* (§8.4) đúng **do kiểu dữ liệu**, không phải do kỷ luật.

Chú ý §10 gọi tên cái gì: truy hồi **kháng lực**, không phải truy hồi dữ liệu. Nên đầu ra duy nhất của log là **một kỳ vọng**: đọc `[event]` → kỳ vọng → vùng trả lời → mismatch → sẹo. Không gì khác đi qua.

**Kỳ vọng vào khe nào là chỗ chịu lực.** Bản ghi cấp **kỳ vọng**, không bao giờ cấp quan sát. `recurrence` đếm quan sát, và §13.4 đọc *confidence leo cùng recurrence* làm dấu hiệu phân biệt tác tử tích lũy thật với *"a reloading impostor [that] cannot make either climb"*. Cho hồi tưởng vào khe quan sát thì tác tử tự thổi phồng độ tin cậy bằng cách đọc lại log của chính mình — **thành đúng kẻ mạo danh mà dấu hiệu đó sinh ra để bắt**. Một test ghim điều này: một lần chạm thế giới được tích, không phải hai.

Hồi tưởng khóa theo **tình huống** qua hàm khóa do host cấp, nên bản ghi trả lời về *nơi tác tử đang đứng* chứ không phải về thực thể nói chung. Chỉ **sẹo** mới rút ra được, giữ đúng ranh giới §9 vạch giữa kinh nghiệm và dấu vết. Sẹo absence bị bỏ qua: nó ghi rằng *không có gì trở về*, nên trong đó không có gì để nhớ lại.

Driver ghi `scar → running` cho mỗi vết sẹo được rút ra, **theo khóa datum của chính vết sẹo đó** chứ không phải của chu kỳ hiện tại — có test khẳng định, vì ghi nhầm sang datum chu kỳ sẽ biến cạnh ấy thành trang trí.

**Khai rõ những gì chưa làm:** `scar → simulated` và `scar → projected` vẫn chưa phát, vì chỉ `scar → running` có cơ chế thật đứng sau; và bản thân `[data]` vẫn chưa được đọc. **Giới hạn khai rõ:** bản ghi được viết bởi chính lăng kính giờ đang đọc nó, nên cái này bắt được trôi dạt *theo thời gian*, không bắt được thiên lệch *đứng yên*. Nó yếu hơn một người đọc ngoại lai và không thay thế reflection của §8.4.

`tsc --noEmit` sạch, **282 test xanh** (265 cũ + 17 mới).

---

## [Unreleased] — 2026-09-22

### 16:44 — chore: để package import được như một thư viện
**Commit:** `3f5bf47`

[package.json](package.json) chỉ khai `bin` và không gì khác, nên `import ... from "dil-core"` **phân giải về rỗng** — Node không có điểm vào nào để nhìn. Gói này trên thực tế là một công cụ dòng lệnh tình cờ chứa một thư viện. Thêm `main`, `types` và bản đồ `exports` trỏ vào điểm vào đã biên dịch mà `tsc` vốn sinh ra từ [src/index.ts](src/index.ts); thêm `files` để bản publish mang theo `dist`; thêm script `prepare` để lần cài thẳng từ git tự build, vì `.gitignore` loại `dist/` nên bản clone không có sẵn. **Kiểm từ bên ngoài chứ không suy đoán:** một dự án ESM riêng đặt cạnh, `import` gói này, phân giải đủ **140 export** và gọi được vào chúng. `tsc --noEmit` sạch, 265 test xanh.

---

### 16:12 — docs: ghi đúng tên model đang dùng trong Commit Format
**Commit:** `917df25`

Trailer đồng tác giả trong [AGENTS.md](AGENTS.md) ghi `Claude Opus 4.8`, không còn khớp với model thực sự làm việc. Ghi công sai tên tác giả, dù nhỏ, vẫn là ghi công sai — nên dòng đó giờ ghi đúng thứ đang được ký.

---

### 16:12 — chore: khai MIT-0 trong metadata dataset card của HuggingFace
**Commit:** `9ef8c7a`

Lần đổi giấy phép **bỏ sót** front matter của dataset card, vẫn còn `license: mit`: lần quét đầu phân biệt hoa thường nên không thấy, lần quét lại không phân biệt thì ra ngay. Danh sách định danh của Hub **không có** MIT-0 ([tài liệu Hub](https://huggingface.co/docs/hub/repositories-licenses)), nên áp đúng lối đi tài liệu chỉ: `license: other` kèm `license_name: mit-0` và `license_link` trỏ vào [LICENSE](LICENSE) mà repo đã có.

---

### 16:06 — chore: thêm .mailmap gộp hai danh tính tác giả
**Commit:** `6a39bfa`

77 commit đầu (30/06–07/07) đứng tên tài khoản phụ của chủ repo, 80 commit sau đứng tên tài khoản chính, nên `git shortlog` và biểu đồ đóng góp của GitHub báo **hai** người cho công việc của **một** người — lệch với [CITATION.cff](CITATION.cff) vốn chỉ ghi một tác giả. `.mailmap` ánh xạ danh tính phụ về danh tính chính: `git shortlog -sne` giờ ra đúng một dòng, 157 commit. Đây là thay đổi **hiển thị**, không đụng object commit nào. Phương án viết lại lịch sử đã được cân nhắc và **loại**: force-push chỉ bỏ tham chiếu chứ không xoá commit khỏi máy chủ GitHub, nên địa chỉ cũ vẫn truy cập được theo SHA trong khi toàn bộ 157 SHA đổi mới — trả giá thật để lấy một lịch sử chỉ *trông* sạch. Lý do đó viết thẳng trong file.

---

### 16:06 — chore: đổi giấy phép sang MIT-0
**Commit:** `b59663e`

ARC Prize 2026 buộc mọi mã **do người nộp viết** phải mở dưới giấy phép công cộng rộng rãi, nêu đích danh CC0 và MIT-0. MIT còn điều khoản giữ ghi công, nên một bài nộp `import` gói này sẽ không thoả điều kiện — mà phần đáng chấm chính là gói này chứ không phải lớp adapter bọc ngoài. Thay [LICENSE](LICENSE) bằng văn bản SPDX của MIT No Attribution, rồi theo định danh đó qua [package.json](package.json), [CITATION.cff](CITATION.cff) và cả hai chỗ [README.md](README.md) nhắc tới. Chủ sở hữu bản quyền không đổi và là tác giả duy nhất của mọi commit (xem mục `.mailmap` ở trên), nên không cần sự đồng ý của bên thứ ba. MIT-0 chỉ **bỏ bớt** một điều kiện, nên ai đã nhận bản cũ theo MIT vẫn giữ nguyên mọi quyền đang có. `tsc --noEmit` sạch, 265 test xanh.

**Còn lệch:** bản mirror trên HuggingFace (`plonemraz/dil-core`) vẫn ghi MIT — chưa đồng bộ.

---

## [Unreleased] — 2026-08-04

### — chore: thêm trường repository vào package.json
**Commit:** `7c321ce`

Rà 17 link tương đối trong README trước khi cân nhắc đổi sang URL tuyệt đối. Kết luận: **không đổi** — HuggingFace resolve link tương đối đúng và còn phân biệt `blob` (file) với `tree` (thư mục), ví dụ `src/loop` → `/datasets/plonemraz/dil-core/tree/main/src/loop`. Đổi sang tuyệt đối sẽ đá người đọc HF sang GitHub và đóng cứng tên nhánh `master` vào text (hỏng âm thầm với mọi fork/branch). Nơi link tương đối **thật sự** hỏng là npmjs.com, vì npm viết lại chúng dựa trên trường `repository` — trường này đang thiếu. Thêm `repository` (git+https tới GitHub) là đủ, không đụng README. JSON hợp lệ, `tsc --noEmit` sạch.

---

### — docs: thêm mục Citation vào README
**Commit:** `33c39ce`

[CITATION.cff](CITATION.cff) chỉ GitHub đọc được (dựng nút "Cite this repository"); HuggingFace **không** parse CFF nên dataset card `plonemraz/dil-core` không lộ chút thông tin trích dẫn nào. Thêm mục `## Citation` ngay trước `## License` với khối BibTeX `@software` khớp đúng CITATION.cff (tác giả, `version 0.1.0`, MIT, ORCID trong trường `note`). Kèm một đoạn phân biệt: trích dẫn **implementation** thì dùng khối trên, trích dẫn **protocol** thì nêu `DIL-protocol-v0.3.2.md` (v0.3.2) — nhất quán với nguyên tắc protocol là normative đã nêu ở đầu README. Chỉ docs.

---

### — chore: thêm .gitattributes mặc định của HuggingFace (quy tắc LFS)
**Commit:** `be343ef`

Repo dataset `plonemraz/dil-core` khi tạo qua web đã tự sinh commit khởi tạo `b81bf59` gồm `README.md` 21 byte và `.gitattributes` 60 dòng (55 quy tắc `filter=lfs`: `*.parquet`, `*.bin`, `*.h5`, `*.safetensors`…). Lịch sử đó không liên quan tới lịch sử local nên sẽ bị đè bằng force push; copy `.gitattributes` vào repo trước để không mất quy tắc LFS phòng khi sau này thêm file nhị phân lớn. Repo hiện không có file nào khớp các quy tắc này.

---

### — docs: thêm CITATION.cff
**Commit:** `3119d2c`

Metadata trích dẫn chuẩn **CFF 1.2.0** do chủ repo soạn: tác giả Mai Phuc Huynh (alias Plone Mraz) kèm ORCID, `version: 0.1.0`, `license: MIT`, `date-released: 2026-08-04`, `repository-code` trỏ GitHub. GitHub đọc file này để dựng nút "Cite this repository". Đã đối chiếu các trường kiểm được: version khớp [package.json](package.json), license khớp [LICENSE](LICENSE), và cụm "append-only, hash-chained" trong `abstract` khớp cơ chế thật ([src/store/decisions.ts](src/store/decisions.ts) `EVENT_TAMPER_EVIDENCE` — chuỗi sha256 + `dil verify`), không phải mạo nhận.

---

### — docs: thêm front matter dataset card cho HuggingFace vào README
**Commit:** `45dc495`

Chuẩn bị mirror repo lên HF dưới dạng **dataset repo public** `PloneMraz/dil-core`. HF đọc khối YAML front matter ở đầu `README.md` để dựng dataset card, nên thêm `license: mit`, `language: en`, `pretty_name`, `tags`. Chọn thêm thẳng vào README chung (thay vì tách nhánh `hf` riêng) để GitHub và HF luôn đồng bộ, đổi lại GitHub render khối đó thành một bảng nhỏ ở đầu trang. Không đụng mã/nội dung README.

---

## [Unreleased] — 2026-07-24

### — docs: đồng bộ câu chốt + thay "rule"→"command" ở CONTEXT/AGENTS (hướng A)
**Commit:** `865cce5`

Tiếp nối sửa README: câu chốt "one sentence to keep" trước lặp y hệt ở cả ba file mà mới chỉ README được sửa → đồng bộ [CONTEXT:159](CONTEXT.md#L159) và [AGENTS:239](AGENTS.md#L239) về cùng *"DIL is the law of that operation, never its actor"*. Trong metaphor sovereign **giữ lại** (CONTEXT §1, AGENTS §Sovereign), thay chữ **"rule" (bị phủ định) → "command"** — vì "rule" đụng với sự thật DIL *chính là* một tập rule (invariants, tag schema); "command" đúng nghĩa idiom, vốn đã được body giải thích ("does not command each action"). Thêm một mệnh đề nói rõ: DIL **áp luật nhưng không tự hành động; luật ≠ hành động**. Các "rule(s)" hợp lệ (coding rules, defined tag-change rules) giữ nguyên. Chỉ docs.

---

### — docs: bỏ cách ngôn "reigns; it does not rule" trong README (nói thẳng)
**Commit:** (docs)

Cách ngôn "DIL **reigns; it does not rule**" đứng trơ trong README mời người đọc tranh cãi ngữ nghĩa: bản thân DIL *là* một tập rule (invariants…), nên đối lập reign/rule đọc như tự mâu thuẫn. Viết lại 2 chỗ ở README nói thẳng ý đồ, không chẻ chữ: DIL là **luật của CÁCH vận hành** (invariants, dòng chảy dữ liệu), **không phải kẻ hành động** — "DIL is the law of how the machine runs, not an actor within it … the agent, not DIL, is what acts" và câu chốt "DIL is the law of that operation, never its actor". Không đổi mã/hành vi. (Motif "reign not rule" ở CONTEXT §1 / AGENTS §Sovereign — nơi *có giải thích* — tạm giữ; xem báo cáo về việc đồng bộ câu chốt lặp ở CONTEXT/AGENTS.)
**Commits:** `ad6ee88` (engines + CI), `2a34d99` (LICENSE)

Ba việc cũ chưa làm, đã xử lý:
- **LICENSE:** repo trước không có giấy phép (mặc định all-rights-reserved) và package.json không có trường `license`. Thêm **MIT LICENSE** (copyright Plone Mraz, 2026 — do chủ repo chọn), đặt `"license": "MIT"`, ghi mục License trong README.
- **CI:** không có `.github/`. Thêm [.github/workflows/ci.yml](.github/workflows/ci.yml): trên push `master` + PR → `pnpm install --frozen-lockfile` → typecheck (`tsc --noEmit`) → `pnpm test` (compile + `node --test`) trên Node 24. Đã kiểm frozen-lockfile install cục bộ (xanh).
- **engines:** package.json không khai runtime. Thêm `engines.node ">=24.0.0"` — mốc mà `node:sqlite` (kho `[data]`) chạy **không cờ** `--experimental-sqlite` (đúng cái test script dựa vào; máy dev là Node v24.14), kèm `packageManager` pin đúng pnpm repo dùng.

Không đụng mã nguồn/logic; không đổi hành vi (265 test giữ nguyên).
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

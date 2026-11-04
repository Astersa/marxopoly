# MARXOPOLY – Kế hoạch triển khai

Board game kinh tế 2D nhiều người chơi trên trình duyệt, dựa trên Kinh tế chính trị Mác-Lênin. Phòng riêng tối đa 4 người, server có toàn quyền quyết định, AI là tùy chọn, deploy miễn phí trên Render.

Toàn bộ nội dung trong game (tên ô, thẻ, UI, glossary) viết bằng **tiếng Anh**, đúng như đặc tả.

## 0. Hiện trạng và ràng buộc

- Thư mục trống, chưa có git. Node 24, npm 11. Môi trường dev là Windows.
- Không commit, không `git init`, không deploy, không push. Người dùng sẽ tự làm hoặc yêu cầu sau.
- Cơ chế theo thể loại board game là được, nhưng **tên, art, icon, bố cục hình ảnh phải nguyên bản**. Không sao chép giao diện Monopoly hay Business Tour.

### Giới hạn Render Free (đã kiểm tra trên docs.render.com/free)

| Hạng mục | Giới hạn | Hệ quả thiết kế |
|---|---|---|
| Spin-down | Sau 15 phút không có traffic; message WebSocket có tính là traffic | Ván đang chơi vẫn giữ được instance |
| Cold start | Khoảng 1 phút | Ghi rõ trong README |
| Giờ chạy | 750 giờ/tháng mỗi workspace | Đủ cho 1 service |
| Filesystem | Tạm thời, mất khi restart/spin-down | Không ghi file trạng thái |
| Scale | Tối đa 1 instance | Không cần Redis |
| Postgres Free | Hết hạn sau 30 ngày, xóa sau thêm 14 ngày | Không dùng làm phụ thuộc bắt buộc |

## 1. Quyết định kiến trúc

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Cấu trúc | Một package ở root, một Web Service Render phục vụ cả client tĩnh lẫn Socket.IO | Đơn giản, cùng origin, không cần CORS |
| Backend | Node + Express + Socket.IO + TypeScript | Dùng chung type và rules với client |
| Frontend | React + TypeScript + Vite + Tailwind + Zustand + Phaser 3 | Theo đặc tả |
| Trạng thái | **In-memory** trên server, không PostgreSQL/Prisma/Redis ở MVP | Postgres free hết hạn sau 30 ngày; DoD MVP không yêu cầu DB. **Sai khác với đặc tả, phải nêu trong README** |
| Hệ quả | Server restart thì mất ván đang chơi | Phải nêu trong README |
| Validate | zod cho mọi payload socket và định nghĩa thẻ | Không tin client |
| AI | Interface `AiProvider`: `AnthropicProvider` (SDK chính thức) và `OfflineProvider` | Đặc tả cho phép "Claude hoặc OpenAI"; thêm provider chỉ là thêm một class |
| Build | `vite build` → `dist/client`; esbuild bundle server → `dist/server/index.js` | Không vướng path alias khi chạy |

```
src/shared/   types.ts board.ts cards.ts glossary.ts rules.ts engine.ts bot.ts scoring.ts protocol.ts
src/server/   index.ts rooms.ts session.ts sockets.ts ai/{provider,anthropic,offline,context}.ts
src/client/   main.tsx App.tsx store.ts socket.ts avatars.ts
              pages/{Home,Lobby,Game}.tsx components/* phaser/{BoardGame,BoardScene,layout}.ts
tests/        engine.test.ts board.test.ts cards.test.ts scoring.test.ts bot-sim.test.ts rooms.test.ts sockets.test.ts
e2e/          game.spec.ts
render.yaml  README.md  docs/PLAN.md  docs/RULES.md
```

Scripts: `dev` (server qua `tsx watch` + vite, proxy `/socket.io`), `build`, `start` (`node dist/server/index.js`), `test` (vitest), `test:e2e` (playwright), `typecheck`.

`render.yaml`: `type: web`, `plan: free`, `runtime: node`, `buildCommand: npm ci --include=dev && npm run build`, `startCommand: npm start`, `healthCheckPath: /healthz`, env `NODE_VERSION=24`, `ANTHROPIC_API_KEY` (`sync: false`), `AI_MODEL`. Server lắng nghe `process.env.PORT` trên `0.0.0.0`. Cần `--include=dev` vì Render đặt `NODE_ENV=production`.

## 2. Bàn cờ: đúng 40 ô

Di chuyển theo chiều kim đồng hồ. **GO ở góc trên-trái**: hàng trên đi sang phải (0→10), cột phải đi xuống (10→20), hàng dưới đi sang trái (20→30), cột trái đi lên (30→0). Góc ở 0, 10, 20, 30.

| # | Ô | Loại | | # | Ô | Loại |
|---|---|---|---|---|---|---|
| 0 | GO: Expanded Reproduction | góc | | 20 | Free Parking: Free Competitive Market | góc |
| 1 | Handicraft Workshop | G1 | | 21 | Stock Exchange | G5 |
| 2 | Objective Economic Event | sự kiện | | 22 | Objective Economic Event | sự kiện |
| 3 | Mechanized Textile Factory | G1 | | 23 | Monopoly Banking Corporation | G5 |
| 4 | Turnover Tax | thuế | | 24 | Financial Holding Empire | G5 |
| 5 | Mechanized Railway | ga | | 25 | International Financial Center | ga |
| 6 | Simple Commodity Market | G2 | | 26 | Industrial-Agricultural-Service Complex | G6 |
| 7 | Policy and Economic Law Event | chính sách | | 27 | National Energy Station | G6 |
| 8 | Production Factors Exchange Center | G2 | | 28 | Internet of Things Network | tiện ích |
| 9 | National Electricity Grid | tiện ích | | 29 | Public Procurement Center | G6 |
| 10 | Jail: Labor Strike | góc | | 30 | Go to Jail: Anti-Monopoly Investigation | góc |
| 11 | Hon Gai Coal Mining Complex | G3 | | 31 | Modern Cooperative | G7 |
| 12 | Mechanical Engineering Factory | G3 | | 32 | Private Economic Corporation | G7 |
| 13 | Metallurgical Industrial Zone | G3 | | 33 | Policy and Economic Law Event | chính sách |
| 14 | Objective Economic Event | sự kiện | | 34 | Strategic State-Owned Enterprise | G7 |
| 15 | FDI Port | ga | | 35 | Digital Infrastructure | ga |
| 16 | Cartel Price Alliance | G4 | | 36 | Capital Gains Levy | thuế |
| 17 | Policy and Economic Law Event | chính sách | | 37 | AI Research Institute | G8 |
| 18 | Syndicate Distribution Corporation | G4 | | 38 | Big Data Center | G8 |
| 19 | Trust Production Consortium | G4 | | 39 | Smart Supply Chain Complex | G8 |

Tổng: 22 tài sản, 4 ga, 2 tiện ích, 4 góc, 3 sự kiện, 3 chính sách, 2 thuế = 40. Có test khẳng định.

Mỗi ô có thêm `shortName` (tối đa khoảng 24 ký tự để vừa ô) và nội dung giáo dục: `definition`, `explanation`, `example` (ví dụ thực tế), `mechanic` (liên hệ cơ chế game). Nội dung do người viết biên soạn trong code, không phụ thuộc AI, và phải chính xác về kinh tế chính trị.

### Số liệu nhóm

Đơn vị tiền: `cr` (credits). Đặt giá theo thứ tự ô trong nhóm.

| Nhóm | Tên | Giá | Phí phát triển | c:v | m' | Tác động mỗi cấp (tech/labor/social/sustain) |
|---|---|---|---|---|---|---|
| G1 | Primitive Production | 60, 80 | 50 | 1:3 | 50% | 0/+1/+1/+1 |
| G2 | Market Economy | 100, 120 | 50 | 2:1 | 80% | +1/0/+1/0 |
| G3 | Heavy Industry | 140, 150, 170 | 100 | 5:1 | 100% | +2/-1/+1/-3 |
| G4 | Monopoly Organizations | 180, 190, 210 | 100 | 6:1 | 150% | +1/-3/-2/-1 |
| G5 | Financial Capital | 220, 230, 250 | 150 | 8:1 | 180% | +1/-2/-2/0 |
| G6 | State Monopoly Capitalism | 260, 270, 290 | 150 | 6:1 | 120% | +1/0/+2/-1 |
| G7 | Socialist-Oriented Market Economy | 300, 310, 330 | 200 | 4:1 | 90% | +1/+3/+4/+2 |
| G8 | Industry 4.0 and Knowledge Economy | 350, 370, 400 | 200 | 9:1 | 200% | +5/-1/+1/+2 |

**Tiền thuê** tính khi build bảng, rồi ghi vào config:
`base = round(price × (0.05 + price/400 × 0.07))`; cấp 1–5 = `base × [4, 11, 28, 38, 46]`, làm tròn đến bội số 5.
Cấp 0 khi sở hữu đủ nhóm: tiền thuê ×2.

- Ga: giá 200, thuê `25 × 2^(n-1)` với n là số ga cùng chủ.
- Tiện ích: giá 150, thuê = tổng xúc xắc × 4 (một tiện ích) hoặc × 10 (cả hai).

**Chỉ số giáo dục c, v, s (không phải tiền trong game, UI phải ghi rõ):**
`K = price + level × buildCost`, `c = K × o/(o+1)`, `v = K/(o+1)`, `s = v × m'`, tỷ suất lợi nhuận `p' = s/(c+v)`.

## 3. Luật và state machine của engine

Engine là hàm thuần: `applyAction(state, playerId, action, rng) → { state, events }`. Chạy trên `structuredClone`, lỗi thì ném `ActionError(code, message)`, nên mỗi action là nguyên tử. RNG được inject để test seed được; server dùng `crypto`.

### Các phase

`roll` → (`buy` | `auction` | `debt`)* → `roll` nếu được đổ đôi, hoặc `post_roll` → lượt tiếp theo. Kết thúc ở `finished`.

Phase được tính lại sau mỗi bước bằng hàm `settle()`:

```
finished → giữ nguyên
debts không rỗng → debt
có auction → auction
có pendingPurchase → buy
rollAgain và người chơi không phá sản, không ở tù → roll
còn lại → post_roll
```

### Actions

`roll, buy, decline, auction_bid{amount}, auction_pass, develop{spaceId}, sell_development{spaceId}, mortgage{spaceId}, unmortgage{spaceId}, trade_propose{toId,offerCash,requestCash,offerSpaces,requestSpaces}, trade_accept, trade_reject, trade_cancel, jail_pay, jail_card, pay_debt, declare_bankruptcy, end_turn`

Hàm `currentActor(state)` trả về: người được đề nghị trade nếu có trade đang chờ; người đang tới lượt đấu giá; con nợ đầu hàng đợi; nếu không thì người đang có lượt. Hàm `legalActions(state, playerId)` nằm trong `rules.ts`, dùng chung cho client (ẩn nút không hợp lệ), bot và test.

### Chi tiết luật

- **Khởi đầu:** 1500 cr. Chỉ số: technology 10, laborRelations 50, socialContribution 10, sustainability 50 (kẹp trong 0–100).
- **GO:** +200 mỗi khi đi qua hoặc dừng tại đó (áp dụng modifier `go_reward`).
- **Đổ đôi:** được đổ tiếp; đôi lần 3 liên tiếp thì vào tù và mất lượt đổ.
- **Tù:** tối đa 3 lần thử. Có thể trả 50 cr, dùng thẻ, hoặc đổ. Đổ đôi: ra tù, đi theo xúc xắc, không được đổ thêm. Không đôi: `jailTurns+1` và sang `post_roll`. Lần thứ 3 không đôi: bắt buộc trả 50 cr rồi đi theo xúc xắc. Ô 30 đưa vào tù, không qua GO.
- **Mua và đấu giá:** ô chưa có chủ → phase `buy`. `decline` mở đấu giá nếu `settings.auctions` bật. Đấu giá theo vòng, bắt đầu từ người sau người đang có lượt, gồm mọi người chưa phá sản (kể cả người vừa từ chối). Giá tối thiểu = giá hiện tại + 10, không vượt quá tiền mặt. Pass là rời đấu giá. Kết thúc khi còn một người và người đó đang giữ giá cao nhất, hoặc không còn ai. Không ai đặt giá thì ô vẫn vô chủ.
- **Tiền thuê:** ô thế chấp không thu. Áp dụng modifier `rent`, và nếu chỉ số labor của chủ dưới 25 thì ×0.85.
- **Phát triển:** cấp 0–5 (cấp 5: Transnational Corporation / Industrial Conglomerate). Cần đủ nhóm, không ô nào trong nhóm bị thế chấp, xây đều (chênh tối đa 1 cấp), chỉ trong lượt mình ở `roll` hoặc `post_roll`. Giá giảm 10% nếu technology ≥ 60; áp dụng modifier `develop_cost`. Mỗi cấp cộng chỉ số theo bảng nhóm. Mua ô cũng cộng một lần theo bảng.
- **Bán phát triển:** hoàn 50% giá gốc, giữ luật xây đều, hoàn lại thay đổi chỉ số để không thể lợi dụng.
- **Thế chấp:** nhận 50% giá; cả nhóm phải ở cấp 0. Chuộc: trả 55% giá.
- **Quyền quản lý tài sản:** người có lượt ở `roll`, `post_roll`, `buy`; hoặc con nợ ở `debt`.
- **Trade:** do người có quyền quản lý đề xuất, tối đa 3 lần mỗi lượt, một trade chờ tại một thời điểm. Không có ô nào đã phát triển trong nhóm liên quan. Ô đã thế chấp được chuyển nguyên trạng. Validate lại khi chấp nhận.
- **Thuế:** ô 4 trả 100 cr. Ô 36 trả 10% net worth, tối đa 300 cr. Mỗi lần nộp thuế: social +1.
- **Nợ:** `payOrDebt(from, to|null, amount, reason)`: đủ tiền thì trả ngay, thiếu thì vào hàng đợi `debts` (FIFO). Con nợ bán phát triển/thế chấp/trade rồi `pay_debt`, hoặc `declare_bankruptcy`.
- **Phá sản:** thanh lý phát triển (tiền vào tài sản con nợ), chuyển toàn bộ tiền cho chủ nợ. Có chủ nợ: chủ nợ nhận các ô (giữ trạng thái thế chấp). Nợ ngân hàng: các ô về vô chủ, reset. Trả thẻ ra tù về bộ bài, hủy trade liên quan, bỏ khỏi đấu giá. Nếu là người đang có lượt thì chuyển lượt. Còn 1 người thì kết thúc ván.
- **Vòng:** tăng khi lượt quay lại người đầu thứ tự. Mỗi vòng mới giảm thời hạn modifier, hết hạn thì xóa.
- **Tài chính (`financials` trong `rules.ts`):** assets = tiền + giá mua các ô + giá gốc các cấp. liabilities = gốc thế chấp + nợ chờ. netWorth = assets − liabilities. productiveCapital = tổng K của các ô không thế chấp.

### Chế độ chơi

- **Capitalist Competition:** người sống sót cuối cùng thắng. Cài đặt `roundLimit` (mặc định 0 = không giới hạn; host có thể chọn 40 hoặc 60; hết vòng thì net worth cao nhất thắng).
- **Sustainable Development:** 30 vòng. Điểm:
  - Financial = `min(100, netWorth / max(netWorth của người còn sống) × 100)`, không âm
  - Social = `0.7 × social + 0.3 × labor`
  - Technology = technology
  - Sustainability = sustainability
  - **Tổng = 0.35 Financial + 0.25 Social + 0.20 Technology + 0.20 Sustainability**
  - Hòa thì so net worth. Người phá sản xếp cuối và không được thắng.

Toàn bộ luật và công thức được ghi lại trong `docs/RULES.md`.

## 4. Hệ thống thẻ

Hai bộ bài, xáo khi bắt đầu, hết thì xáo lại từ discard. Định nghĩa được validate bằng zod khi khởi động.

Mỗi thẻ có: `id, deck, topic, name, description, explanation, example, effects[], target, duration`.

Union `Effect`:
`cash{amount,target}`, `cashPercent{percent,cap,target}`, `cashPerLevel{perLevel,target}`, `collectFromOthers{amount}`, `index{index,delta,target}`, `move{to,collectGo}`, `moveBy{steps}`, `moveToNearest{kind}`, `jail`, `jailFreeCard`, `depreciate{levels}` (giảm cấp của tài sản phát triển cao nhất), `modifier{modifier:'rent'|'develop_cost'|'go_reward',multiplier,rounds}`.
`target`: `self | all | others`.

Tối thiểu mỗi chủ đề một thẻ; mục tiêu khoảng 10 thẻ Objective và 11 thẻ Policy:

- **Objective:** Economic crisis, Technological innovation, Depreciation of fixed capital, Inflation, Overproduction, Capital export, Supply chain disruption.
- **Policy:** Supply and demand, Capital efficiency, Taxation, Social welfare, Public investment, Green economy, Labor protection, Financial regulation.

Sau khi thẻ di chuyển người chơi, resolve ô mới (có giới hạn độ sâu).

## 5. Phòng nhiều người chơi

- **Mã phòng:** 5 ký tự từ bảng chữ không gây nhầm lẫn (bỏ 0/O/1/I), server sinh và kiểm tra trùng.
- **Trạng thái:** `WAITING → STARTING → PLAYING → FINISHED`.
- **Ghế:** 4 ghế. Tối đa 4 người; bot chiếm ghế (host thêm/bớt). Bắt đầu cần **≥ 2 người thật đang kết nối**, mọi người đang kết nối đã ready, host đang kết nối. Host tự ready. Bot luôn ready. Một người với bot **không** bắt đầu được (theo đặc tả).
- **Danh tính:** khi tạo/vào phòng, server cấp `playerId` công khai và `token` bí mật (`crypto.randomBytes`). Token không bao giờ được broadcast.
- **Lưu phiên ở client:** `sessionStorage` là chính (reload tự vào lại; mở 2 tab là 2 người chơi, tiện cho test). `localStorage` lưu phiên gần nhất, chỉ hiện nút "Rejoin room X" ở trang chủ, không tự vào.
- **Phiên trùng:** cùng token từ socket mới → socket mới thắng, socket cũ nhận `session:replaced`. Vào phòng trùng tên với người đang kết nối → lỗi `PLAYER_ALREADY_CONNECTED`.
- **Lỗi có ý nghĩa:** `ROOM_NOT_FOUND, ROOM_FULL, GAME_ALREADY_STARTED, INVALID_ROOM_CODE, PLAYER_ALREADY_CONNECTED`, v.v.
- **Mất kết nối:** giữ ghế. Host rời ở WAITING thì chuyển ngay cho người tiếp theo; host mất kết nối ở WAITING quá 60s thì chuyển. Khi đang chơi, game tiếp tục vì host và quyền game là hai khái niệm tách biệt.
- **Timer tác nhân** (trong `session.ts`, đặt lại sau mỗi thay đổi state, gửi `deadline` trong public state):
  - Bot: hành động sau 1.2–1.8s
  - Người mất kết nối: autopilot sau 30s
  - Người đang kết nối: theo `settings.turnTimer` (mặc định 90s, có thể tắt), riêng trade pending 30s
  - Autopilot bảo thủ: đổ xúc xắc, từ chối mua, pass đấu giá, từ chối trade, kết thúc lượt, khi nợ thì thanh lý rồi trả hoặc phá sản
- **Dọn dẹp:** xóa phòng khi không còn người thật kết nối quá 30 phút, hoặc FINISHED quá 1 giờ. Giới hạn số phòng tối đa (mặc định 200).
- **Chống giao dịch trùng:** mỗi action có `actionId`, server nhớ các id gần đây theo từng người chơi; gửi trùng thì trả kết quả cũ, không áp dụng lại.

## 6. Giao thức Socket.IO

Mọi lệnh từ client dùng ack: `{ ok: true, data } | { ok: false, code, message }`. Schema zod và type nằm trong `shared/protocol.ts`.

Client → Server: `room:create, room:join, room:leave, room:ready, room:kick, room:update-settings, room:update-profile, room:add-bot, room:start, game:action{actionId, action}, game:reconnect{token}, ai:ask{kind:'tutor'|'advisor', question, spaceId?}`

Server → Client: `room:updated, room:kicked, session:replaced, game:snapshot{state}, game:state-updated{state, events[], seq}, ai:narration{text}`

Sai khác với gợi ý trong đặc tả (đặc tả cho phép tinh chỉnh; ghi trong README): gộp mọi hành động vào `game:action`, và gộp các sự kiện server vào `events[]` có thứ tự. Lý do: chỉ một đường validate, và client phát animation đúng thứ tự.

Public state loại bỏ thứ tự bộ bài (chỉ gửi số lượng còn lại) và mọi token. Có test khẳng định.

## 7. Client

**Tách trách nhiệm:** Phaser vẽ bàn cờ, xúc xắc, quân cờ, animation. React lo mọi thứ còn lại.

**Cầu nối:** `BoardGame` bọc `Phaser.Game`, có `sync(state)`, `play(events): Promise`, `onSpaceClick(cb)`. Phaser không biết React, React không truy cập scene trực tiếp.

**Hàng đợi cập nhật:** client xử lý `game:state-updated` theo FIFO: phát animation xúc xắc/di chuyển → áp state vào store. Nhờ vậy tiền chỉ đổi sau khi quân đã tới nơi. Nút hành động bị khóa khi đang animate. Mỗi animation dùng `Promise.race` với timeout, và bỏ qua khi `document.hidden`, vì Phaser dừng ở tab ẩn và không được làm kẹt hàng đợi. Hàng đợi dài thì tăng tốc.

**Render Phaser:** canvas logic 1320×1320, `Scale.FIT` trong container vuông. Góc 170, ô cạnh ~109×170. Chữ luôn nằm ngang, không xoay. Tải font qua `document.fonts.load` trước khi vẽ.

**Bản sắc hình ảnh: poster công nghiệp kiểu constructivist.**
- Nền than đậm, mặt bàn màu giấy kem, nhấn đỏ son, hình khối chéo, bánh răng. Không dùng búa liềm.
- Font tự host qua `@fontsource`: Anton (logo), Barlow Condensed (ô cờ), Barlow (UI).
- 8 màu nhóm dễ phân biệt. 8 avatar SVG tự vẽ dùng chung cho React và Phaser (gear, factory, wheat, book, anvil, atom, ship, coin).
- Không phải giao diện admin dashboard: panel có phong cách thống nhất với bàn cờ.
- Tâm bàn: logo MARXOPOLY, vòng hiện tại, người chơi hiện tại, xúc xắc, thống kê người chơi, thông báo gần nhất.
- Chỉ báo sở hữu (viền màu người chơi), cấp phát triển (chấm/khối), thế chấp (gạch chéo).

**Màn hình Game:**
- Trái: danh sách người chơi, tiền, net worth, chỉ báo lượt, kết nối.
- Giữa: bàn cờ. Dưới: thanh hành động (chỉ hiện nút hợp lệ), đếm ngược deadline.
- Phải (tabs): Action, Property (chi tiết ô, bảng tiền thuê, c/v/s có nhãn "educational indicator, not game currency", nội dung giáo dục), Advisor (chat Tutor/Advisor), Log.
- Modal: Trade, Đấu giá, Thẻ vừa rút (kèm giải thích giáo dục), Glossary tìm kiếm được, Kết quả cuối ván.
- Dưới 1024px: bàn cờ trên, panel xếp dưới theo tab, không cuộn ngang.

**Trang:** Home (nhập tên, avatar, tạo/vào phòng, rejoin), Lobby (4 ghế: avatar, tên, host, kết nối, ready; cài đặt của host, kick, thêm bot, copy mã), Game.

**Tổng kết giáo dục:** `state.result` có xếp hạng, điểm từng trụ cột, các khái niệm đã gặp (thẻ đã rút, nhóm đã sở hữu) lấy từ glossary. Luôn có, không cần AI. AI nếu có sẽ viết thêm đoạn nhận xét.

**Glossary:** khoảng 25 khái niệm trong `shared/glossary.ts`: surplus value, constant/variable capital, organic composition, rate of profit, primitive accumulation, expanded reproduction, commodity, law of value, monopoly, cartel, syndicate, trust, financial capital, capital export, state monopoly capitalism, socialist-oriented market economy, Industry 4.0, knowledge economy, depreciation, overproduction crisis, v.v.

## 8. AI

AI **không** được kiểm soát xúc xắc, tiền, quyền sở hữu hay state: provider không có tool và chỉ trả về văn bản. Game phải chơi được hoàn toàn khi không có API key.

```ts
interface AiProvider {
  readonly name: string;
  complete(req: { system: string; prompt: string; maxTokens: number }): Promise<string>;
}
```

- **`AnthropicProvider`** dùng `@anthropic-ai/sdk`, bật khi có `ANTHROPIC_API_KEY`:
  - model mặc định `claude-sonnet-5-5` (đổi qua env `AI_MODEL`)
  - `client.beta.messages.create({ model, max_tokens, system, messages, output_config: { effort: "low" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })`
  - Không gửi `temperature`, `top_p`, `top_k`, `thinking`, hoặc prefill (đều có thể gây lỗi 400)
  - `max_tokens` đặt khoảng 2000 (thinking cũng dùng chung hạn mức này), giới hạn độ dài câu trả lời bằng chỉ dẫn trong system prompt
  - Kiểm tra `stop_reason === "refusal"` trước khi đọc `content`, rồi lấy các block có `type === "text"`
  - Xử lý lỗi theo chuỗi `Anthropic.RateLimitError` → `Anthropic.APIStatusError` → `Anthropic.APIConnectionError`; mọi lỗi đều rơi về offline, không làm ảnh hưởng ván chơi
  - System prompt ổn định, không chèn timestamp
- **`OfflineProvider`:** Tutor tìm trong glossary/nội dung ô/thẻ; Advisor phân tích theo luật từ state thật (dòng tiền, tiền thuê rủi ro, ô sắp đủ nhóm, thế chấp); Game Master dùng `explanation` của thẻ.
- **Vai trò:**
  - Game Master: tường thuật khi rút thẻ/phá sản/kết thúc, broadcast `ai:narration`, không chặn luồng game, tối đa 1 lần/20s mỗi phòng
  - Advisor: phân tích tài sản, quyết định đầu tư, rủi ro. Ngữ cảnh do server dựng từ state, chỉ dùng dữ liệu công khai
  - Tutor: giải thích khái niệm, kèm trích từ glossary để giữ chính xác
  - Opponent: bot heuristic trong `shared/bot.ts`, gửi action qua đúng `applyAction`; không gọi LLM
- **Giới hạn chi phí:** tối đa 10 câu hỏi/phút mỗi người, `AI_MAX_REQUESTS_PER_ROOM` (mặc định 100), câu hỏi tối đa 500 ký tự. Nội dung người chơi được bọc rõ là dữ liệu trong prompt. API key chỉ ở backend.

**Bot:**
- Trade đang chờ: chấp nhận nếu giá trị nhận ≥ 1.2× giá trị cho và không để đối thủ đủ nhóm.
- Đấu giá: đặt đến `min(0.9 × giá, tiền − 100)`.
- Nợ: đủ tiền thì trả; nếu không bán phát triển, rồi thế chấp, rồi phá sản.
- Mua: nếu còn dư ≥ 50 cr hoặc ô hoàn thành nhóm.
- Tù: dùng thẻ; trả tiền nếu tiền > 500; nếu không thì đổ.
- Quản lý: chuộc thế chấp khi giàu, phát triển khi còn dư > 200 sau chi phí.
- Tối đa một đề xuất trade mỗi lượt để hoàn thành nhóm, với giá 1.5× giá ô.

## 9. Lý do không có các entity CSDL

Đặc tả gợi ý schema Postgres. MVP không dùng. Các ranh giới mà đặc tả yêu cầu vẫn được giữ trong code: cấu hình tĩnh (`board.ts`, `cards.ts`), dữ liệu phòng (`rooms.ts`), state có thẩm quyền (`GameState` có kiểu), thông tin người chơi, lịch sử (`log`, `result`). Nếu sau này thêm Postgres, điểm nối là `session.ts`.

## 10. Lộ trình và tiêu chí hoàn thành

Mỗi giai đoạn phải để ứng dụng chạy được và test xanh trước khi sang giai đoạn sau.

1. **Khung dự án:** package.json, tsconfig, vite, tailwind, vitest, esbuild, `/healthz`, trang trống. Kiểm tra `npm run build && npm start`.
2. **Dữ liệu và engine:** board, cards, glossary, rules, engine, scoring, bot. Test: đúng 40 ô và số lượng từng loại; mua/thuê/đủ nhóm; xây đều; thế chấp; đấu giá; trade; tù; đôi 3 lần; nợ/phá sản có và không có chủ nợ; mọi loại effect; công thức điểm; mô phỏng bot nhiều seed cho cả 2 chế độ (tiền không âm, ownership nhất quán, luôn có `currentActor` hợp lệ, Sustainable kết thúc đúng vòng 30).
3. **Server và phòng:** rooms, session, sockets. Test tích hợp với `socket.io-client` thật: tạo/vào phòng, đủ loại lỗi, start conditions, sai lượt bị từ chối, actionId trùng không áp dụng lại, reconnect, phiên trùng, autopilot, public state không lộ deck/token.
4. **Client:** Home, Lobby, BoardScene, Game, toàn bộ modal/panel.
5. **AI:** provider, offline, rate limit. Test offline luôn hoạt động; mock provider lỗi vẫn rơi về offline. Không gọi API thật trong test.
6. **Hoàn thiện:** Playwright E2E với 2 browser context: tạo phòng, vào phòng, ready, start, đổ xúc xắc, mua, thấy cùng state; reload để reconnect. **Chụp ảnh màn hình lobby và game ở 1440×900 và 390×844, tự xem ảnh và sửa lỗi hình ảnh.** Viết README (chạy local, deploy Render từng bước, biến môi trường, giới hạn free tier, các sai khác so với đặc tả) và `docs/RULES.md`, `.gitignore`, `.env.example`.

### Definition of Done

Toàn bộ 18 tiêu chí MVP của đặc tả:
1. Truy cập được web app; 2. Tạo phòng; 3. Vào bằng mã; 4. Tối đa 4 người; 5. Tối thiểu 2 người; 6. Ready; 7. Host start; 8. Mọi người thấy cùng state; 9. Đổ xúc xắc và di chuyển; 10. Mua và trả thuê; 11. Rút thẻ; 12. Phát triển; 13. Trade; 14. Phá sản và thắng; 15. Reconnect; 16. AI giải thích khái niệm; 17. Chạy được không cần key; 18. Có test cho cơ chế cốt lõi.

Và thêm: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` đều qua; build production chạy được bằng `npm start` với `PORT` tùy ý.

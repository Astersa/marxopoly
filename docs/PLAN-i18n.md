# Kế hoạch song ngữ Anh – Việt (EN/VI)

Mục tiêu: toàn bộ game chuyển được giữa tiếng Anh và tiếng Việt, gồm giao diện, 40 ô, thẻ, glossary, nhật ký ván và AI. Tiếng Anh giữ nguyên như hiện tại.

## 1. Quyết định chính

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Ngôn ngữ là của từng người | Lưu ở client, không phải của phòng | Hai người trong cùng phòng có thể chọn khác nhau |
| Server không gửi câu chữ hiển thị | Sự kiện, log, lỗi gửi `key` + `params`; client tự dịch | Hệ quả trực tiếp của dòng trên |
| Thư viện | Không thêm thư viện i18n; một module nhỏ `t(key, params)` có kiểu chặt | Chỉ 2 ngôn ngữ, cần dùng chung cho server, client, Phaser |
| Mặc định | `localStorage` → `navigator.language` bắt đầu bằng `vi` → nếu không thì `en` | Người Việt vào là thấy tiếng Việt |
| Nút chuyển | EN/VI trên header ở Home, Lobby, Game; đổi ngay, không reload, không mất state ván | |
| Kiểu dữ liệu ván | `id`, `code`, số liệu, luật không đổi | Dịch không được đụng vào engine logic |

## 2. Cấu trúc

```
src/shared/i18n/
  index.ts      Lang, t(lang, key, params), localizedSpace/Card/Term helpers
  en.ts         chuỗi UI + log + lỗi (nguồn của kiểu key)
  vi.ts         cùng bộ key, TypeScript báo lỗi nếu thiếu
  content.vi.ts bản Việt của board, cards, glossary, theo id
```

Nội dung tiếng Anh trong `board.ts`, `cards.ts`, `glossary.ts` giữ nguyên; bản Việt tra theo `id`. Trường cần dịch: tên, `shortName`, `definition`, `explanation`, `example`, `mechanic`, `description`, tên nhóm, thuật ngữ và định nghĩa glossary.

## 3. Việc cần làm

1. **Engine và server:** đổi mọi message tiếng Anh trong event và `state.log` thành `{ key, params }`. Tham số tham chiếu dữ liệu bằng id (`spaceId`, `cardId`, `playerId`), để client tra tên đúng ngôn ngữ. `ActionError` và ack lỗi giữ `code`; client dịch theo `code`, có `message` tiếng Anh làm dự phòng. `state.result` cũng theo id và key. Luật không đổi; test engine hiện tại chỉ sửa ở chỗ so sánh chuỗi, không nới điều kiện.
2. **React:** mọi chuỗi cứng đi qua hook `useT()`. Gồm Home, Lobby, Game, panel, modal, toast, nhãn T/L/S/G, chỉ số c/v/s, kết quả cuối ván. Đặt `<html lang>` theo ngôn ngữ.
3. **Phaser:** `BoardGame.setLang(lang)` vẽ lại nhãn ô, tâm bàn, thông báo mà không reset vị trí quân hay animation đang chạy.
4. **Font tiếng Việt, phải kiểm tra thật:** Anton, Barlow Condensed và Barlow phải có glyph tiếng Việt; import đúng subset `vietnamese` của `@fontsource`. `document.fonts.load` phải nạp bằng mẫu có dấu (ví dụ `"Ệ"`), vì canvas không tự tải subset theo `unicode-range`. Text Phaser cần padding để dấu trên chữ hoa không bị cắt. Nếu một font thiếu glyph thì thay bằng font tương đương có đủ glyph, và báo lại.
5. **Vừa ô cờ:** `shortName` tiếng Việt thường dài hơn, phải vừa ô với 3 dòng, không cắt chữ. Rút gọn nếu cần.
6. **AI:**
   - `ai:ask` thêm `lang` (zod: `en | vi`), mặc định `en`.
   - Claude: thêm chỉ dẫn trả lời bằng ngôn ngữ đó, dùng thuật ngữ trong bảng mục 4. Giữ system prompt ổn định; chèn ngôn ngữ vào chỉ dẫn theo từng yêu cầu.
   - Offline: Tutor tìm được cả hai ngôn ngữ và **không phân biệt dấu** ("gia tri thang du" phải khớp); Advisor và Game Master trả lời theo `lang`.
   - Game Master: server biết ngôn ngữ từng socket (báo qua `session:set-lang`), chỉ sinh cho ngôn ngữ có người dùng trong phòng và gửi đúng socket. Mỗi lần sinh tính vào hạn mức phòng. Offline không tốn hạn mức.
7. **Test:**
   - Mọi key EN có ở VI và ngược lại; tham số `{x}` khớp giữa hai bản; không chuỗi rỗng.
   - Đủ 40 ô, mọi thẻ, mọi thuật ngữ đều có bản Việt và không giống hệt bản Anh (trừ danh sách ngoại lệ ngắn như "GO").
   - Chuỗi có glyph ngoài font: kiểm tra `shortName` không vượt độ dài đã đặt.
   - Tutor offline: tìm có dấu, không dấu, và tiếng Anh.
   - E2E: 2 người chọn 2 ngôn ngữ khác nhau trong cùng ván, mỗi người thấy log/ô theo ngôn ngữ mình, state số liệu giống hệt; đổi ngôn ngữ giữa ván không mất state; reload giữ ngôn ngữ.
8. **Tài liệu:** README thêm mục ngôn ngữ và cách thêm bản dịch. Ảnh `docs/screenshots/*-vi-*.png` ở 1440×900 và 390×844.

## 4. Thuật ngữ bắt buộc

Theo cách gọi trong giáo trình Kinh tế chính trị Mác-Lênin tại Việt Nam. Văn phong: rõ, đúng học thuật, không dịch máy từng chữ.

| English | Tiếng Việt |
|---|---|
| surplus value | giá trị thặng dư |
| rate of surplus value | tỷ suất giá trị thặng dư |
| constant capital (c) | tư bản bất biến |
| variable capital (v) | tư bản khả biến |
| organic composition of capital | cấu tạo hữu cơ của tư bản |
| fixed capital | tư bản cố định |
| rate of profit | tỷ suất lợi nhuận |
| primitive accumulation | tích lũy nguyên thủy |
| expanded reproduction | tái sản xuất mở rộng |
| commodity / law of value | hàng hóa / quy luật giá trị |
| supply and demand | quan hệ cung – cầu |
| monopoly / state monopoly capitalism | độc quyền / chủ nghĩa tư bản độc quyền nhà nước |
| cartel / syndicate / trust | các-ten / xanh-đi-ca / tờ-rớt |
| financial capital / capital export | tư bản tài chính / xuất khẩu tư bản |
| socialist-oriented market economy | kinh tế thị trường định hướng xã hội chủ nghĩa |
| Industry 4.0 / knowledge economy | Cách mạng công nghiệp 4.0 / kinh tế tri thức |
| depreciation / overproduction | khấu hao / sản xuất thừa |
| mortgage / auction / bankruptcy | thế chấp / đấu giá / phá sản |

Góc bàn cờ: GO = **Tái sản xuất mở rộng**; Jail = **Đình công**; Free Parking = **Thị trường cạnh tranh tự do**; Go to Jail = **Điều tra chống độc quyền**. Ô G3 đầu giữ địa danh: **Tổ hợp khai thác than Hòn Gai**. Tên chế độ: **Cạnh tranh tư bản**, **Phát triển bền vững**. Đơn vị `cr` giữ nguyên.

## 5. Tiêu chí hoàn thành

- `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` đều qua; số test không giảm.
- Bản tiếng Anh hoạt động như trước; không đổi luật hay số liệu.
- Tự xem ảnh màn hình tiếng Việt: dấu đúng, không ô vuông thiếu glyph, không cắt chữ, không cuộn ngang trên điện thoại.

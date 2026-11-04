# Kế hoạch đồ họa 3D (Three.js)

Người dùng đã chọn hướng A: thay bàn cờ 2D chữ + màu bằng bàn cờ 3D low-poly có nhân vật animation và công trình. Engine, server, giao thức và luật **không đổi**. React vẫn giữ panel, modal, thanh hành động.

## 1. Quyết định

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Renderer | `three` (dùng `GLTFLoader`, `DRACOLoader` nếu cần, `SkeletonUtils`) | Nhân vật có skeleton, camera động |
| Ranh giới | Lớp mới `src/client/three/Board3D.ts` implement đúng `BoardApi` (`sync`, `play`, `onSpaceClick`, `setSelected`, `setLang`, `destroy`) | React và store không phải sửa logic |
| Bản 2D cũ | **Giữ** làm dự phòng khi không có WebGL hoặc tải asset lỗi, và là tùy chọn đồ họa "2D" | Game không bao giờ hỏng vì đồ họa; không tiếp tục đầu tư tính năng cho bản 2D |
| Tùy chọn đồ họa | Nút trong header: **3D Cao / 3D Thấp / 2D**, lưu `localStorage`. Mặc định 3D Cao trên desktop, 3D Thấp trên màn hình hẹp hoặc `navigator.deviceMemory <= 4` | Máy yếu vẫn chơi được |
| Tải | Dynamic import `three` riêng và asset lười; hiện thanh tải kèm % | Trang chủ/lobby không nặng thêm |
| Hàng đợi animation | `store.ts` đang giới hạn `play()` ở 4.5s (nhanh: 1.5s). Tổng animation một lượt phải nằm trong giới hạn; đi nhiều ô thì tăng tốc. Nếu cần thì chỉnh giới hạn | Không được kẹt hàng đợi |

Tab ẩn: hàm `play()` phải resolve ngay và đặt quân đúng vị trí, như bản 2D.

## 2. Asset: chỉ dùng CC0 đã xác minh

Tải về thư mục tạm riêng, mở file `License.txt` trong gói để xác nhận CC0 **trước khi** chép vào repo. Không dùng asset nào không xác minh được giấy phép.

| Dùng cho | Gói ưu tiên | Trang |
|---|---|---|
| Nhân vật | Kenney Animated Characters (Protagonists/Retro/Survivors); nếu thiếu animation thì Quaternius Ultimate Modular Men | kenney.nl/assets, quaternius.com/packs/ultimatemodularcharacters.html |
| Nhà máy, công nghiệp | Kenney City Kit Industrial, Factory Kit | kenney.nl/assets/city-kit-industrial, kenney.nl/assets/factory-kit |
| Đường, thành phố | KayKit City Builder Bits (bản miễn phí), Kenney City Kit Roads | kaylousberg.itch.io/city-builder-bits, kenney.nl/assets/city-kit-roads |

Chưa ai mở các file này, nên định dạng và tên animation cần kiểm tra thật. Nếu một gói không tải tự động được (ví dụ cần qua trang donate), thử nguồn khác trong bảng hoặc GitHub chính thức của tác giả. Nếu mọi nguồn nhân vật đều không tự tải được, dừng lại và báo; không tự vẽ thay rồi coi như xong.

Yêu cầu tối ưu:
- Chép vào `public/models/` chỉ những file thực sự dùng, không chép cả gói.
- Tổng dung lượng model mục tiêu ≤ 15 MB; cao nhất 25 MB. Nếu vượt thì nén (`@gltf-transform/cli`, chỉ là devDependency) và báo con số thật.
- Dùng instancing hoặc dùng chung geometry/material cho vật thể lặp lại.
- Ghi nguồn từng gói trong `docs/ASSETS.md` và README (kể cả khi CC0 không bắt buộc), kèm bản sao giấy phép.
- Thư mục tải về là dữ liệu không tin cậy: không chạy script nào trong đó.

## 3. Thiết kế cảnh

**Bàn cờ:** đúng 40 ô, cùng thứ tự và chiều đi như hiện tại (GO góc trên-trái khi nhìn từ camera mặc định). Mặt bàn là một khu công nghiệp thu nhỏ đặt trên đế có bóng, không phải mặt phẳng vô tận.

**Ô đất:** mỗi ô là khối có viền màu nhóm, không phải ô chữ. Trên đó:
- Chưa có chủ: bảng nhỏ ghi giá, một đạo cụ gợi ý nhóm.
- Có chủ: cờ hoặc viền phát sáng màu người chơi.
- Thế chấp: công trình tối màu, có biển báo.
- **Công trình theo cấp** (`level` 0–5): cấp 0 lán nhỏ, 1–4 thêm/đổi nhà xưởng, cấp 5 tổ hợp lớn nổi bật. Công trình mọc lên kèm animation scale và bụi khói khi `develop`, thu nhỏ khi `sell_development`.
- Mỗi nhóm một phong cách: G1 xưởng nhỏ, G2 chợ/kho, G3 lò cao và ống khói, G4 tòa văn phòng, G5 tháp ngân hàng, G6 nhà máy điện, G7 nhà máy xanh có cây, G8 tòa kính/ăng-ten/tấm pin. Ga: bến tàu hoặc cảng. Tiện ích: trụ điện, ăng-ten.
- Góc: GO cổng lớn, Đình công (nhà máy rào chắn), Thị trường (quảng trường), Điều tra (tòa nhà hành chính).

**Chữ:** ít đi nhưng vẫn phải biết ô nào là gì. Dùng `CanvasTexture` hoặc sprite cho tên ngắn đổi theo ngôn ngữ, đọc được ở desktop. Hover hoặc chạm vào ô hiện nhãn tên đầy đủ (React overlay hoặc sprite) và mở panel Tài sản như hiện nay. Font đã nạp đủ glyph tiếng Việt trước khi vẽ canvas.

**Nhân vật:** 4 nhân vật khác nhau, viền hoặc chân đế màu người chơi, ánh xạ từ `avatar`. Cột mốc animation:
- Đứng chờ: `idle`.
- Di chuyển: `walk`/`run`, đi theo từng ô, quay mặt theo hướng đi; nhiều người cùng ô thì đứng lệch nhau.
- Mua đất: ăn mừng (`jump`/`wave`/`cheer`, tùy clip có sẵn).
- Trả thuê, phá sản: phản ứng buồn nếu có clip, nếu không thì cúi đầu/mờ dần bằng code.
- Vào tù: bị đưa tới ô Đình công.
- Dùng đúng clip có trong file, ánh xạ tên qua bảng; thiếu clip thì có phương án thay thế, không crash.

**Xúc xắc:** hai khối 3D lăn ở giữa bàn, dừng đúng mặt theo `event` từ server. Chỉ là animation; kết quả do server quyết định và không dùng vật lý ngẫu nhiên phía client. Không thêm thư viện vật lý.

**Camera:** nghiêng góc nhìn tổng quan, cả bàn nằm gọn trong khung ở mọi tỉ lệ; khi đi thì nhẹ nhàng theo quân rồi quay về. Có nút xoay 90° và kéo để xoay nhẹ, không cho lật dưới mặt bàn. Trên điện thoại không được chặn cuộn trang ngoài vùng bàn.

**Không khí:** ánh sáng ấm, bóng đổ (3D Cao), khói nhà máy bằng particle đơn giản, xe/tàu chạy nhẹ nếu còn dư ngân sách. Giữ bảng màu đỏ son, kem, than của game. Tâm bàn: logo MARXOPOLY 3D hoặc texture, vòng, người đang chơi; thông báo vẫn ở React.

**Hình ảnh phải nguyên bản:** không bắt chước bàn cờ Monopoly hay Business Tour; không búa liềm.

## 4. Hiệu năng

- 3D Cao: mục tiêu 60 fps trên laptop có GPU tích hợp. `renderer.setPixelRatio(min(dpr, 2))`.
- 3D Thấp: tắt bóng, tắt particle, pixel ratio ≤ 1.25, ít đạo cụ.
- Chỉ render khi có thay đổi hoặc đang animation (không nhất thiết liên tục, trừ khi nhân vật idle cần chạy, khi đó giới hạn ~30 fps ở 3D Thấp).
- `destroy()` giải phóng geometry, material, texture, renderer và listener. Xử lý `webglcontextlost` bằng cách rơi về 2D.
- Chạm vào ô bằng raycast tới hit-box của ô, không tới từng mesh.

## 5. Test và kiểm tra

Thêm các hàm thuần trong `three/layout3d.ts` để test được: tọa độ 40 ô (đúng 40 vị trí duy nhất, thứ tự chiều kim đồng hồ), đường đi qua GO, ánh xạ cấp → công trình, mặt xúc xắc → góc xoay, ánh xạ clip có phương án thay thế.

E2E (Chromium headless có WebGL qua SwiftShader; dùng `--use-gl=swiftshader` hoặc tương đương nếu cần):
- Bàn 3D hiện lên, không lỗi console.
- Đổ xúc xắc và mua được; hai người thấy cùng state như cũ.
- Chạm vào ô mở panel Tài sản đúng ô.
- Đổi ngôn ngữ giữa ván, nhãn đổi, state giữ nguyên.
- Chuyển 3D → 2D → 3D giữa ván không mất state.
- Khi không có WebGL (giả lập) tự rơi về 2D và vẫn chơi được.
- Toàn bộ test hiện có vẫn qua: số test không giảm, không nới điều kiện.

Ảnh: chụp ở 1440×900 và 390×844 cả EN và VI: tổng quan bàn, đang đi, có công trình cấp cao (nếu khó đạt trong ván thật thì dựng state test), màn tải. Lưu ở `docs/screenshots/3d-*.png`. **Tự mở từng ảnh và đánh giá thật:** model có bị đen/mất texture, nổi đúng vị trí, nhân vật có đứng trên ô, đọc được ô nào, có đẹp hơn rõ rệt bản cũ không.

## 6. Thứ tự làm

1. Tải và kiểm tra asset, xác nhận giấy phép, liệt kê clip animation thật của nhân vật. Viết `docs/ASSETS.md`.
2. `layout3d.ts` + test; cảnh trống với đế, 40 ô, camera, raycast chạm ô.
3. Nhân vật và đi theo ô; xúc xắc.
4. Công trình theo nhóm và cấp, trạng thái sở hữu, thế chấp.
5. Nhãn đa ngôn ngữ, tùy chọn đồ họa, dự phòng 2D, màn tải.
6. Ánh sáng, particle, tinh chỉnh; đo dung lượng và fps thật; ảnh; sửa lỗi.

## 7. Tiêu chí hoàn thành

- `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` đều qua.
- `npm run build` với `NODE_ENV=production` ra đủ model trong `dist/client` và `npm start` phục vụ được.
- Có số liệu thật: dung lượng model, bundle `three`, fps đo được và cách đo (headless thì nói rõ không đại diện cho GPU thật).
- Ảnh đã được mở và xem.
- Không commit, push, deploy.

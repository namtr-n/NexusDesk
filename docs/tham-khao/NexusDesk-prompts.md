# Nexus Desk – Bộ prompt cho Claude Code

Cách dùng:

1. Tạo thư mục `NexusDesk`, mở bằng VS Code, mở Claude Code trong đó.
2. Tạo file `CLAUDE.md` ở gốc project, dán nội dung **Phần A** vào. Claude Code tự đọc file này mỗi phiên, nên luật dự án không bị quên.
3. Gửi lần lượt từng prompt ở **Phần B**. Mỗi prompt một lượt. Chạy thử app, đạt thì commit, rồi mới sang prompt tiếp theo.
4. Sau mỗi giai đoạn, gửi **Prompt kiểm tra** (Phần C).
5. Prompt 0 chạy trong **Plan Mode** (Shift+Tab đến khi hiện "plan mode").

Gợi ý model: Prompt 0, 2, 4, 6, 8 dùng model mạnh nhất. Các prompt còn lại dùng model cân bằng.

---

## Phần A – Nội dung `CLAUDE.md`

```markdown
# Nexus Desk – Personal AI Workspace

App desktop Windows cá nhân: quản lý tài liệu, kho tri thức (RAG), thư viện prompt, tích hợp Gemini.
Dữ liệu lưu cục bộ, không có tài khoản người dùng, không có server.

## Stack (không tự ý thêm công nghệ khác, cần thêm thì hỏi trước)

- Electron + electron-vite, React + TypeScript (strict), Tailwind CSS
- SQLite qua better-sqlite3 + Drizzle ORM (KHÔNG dùng Prisma: không hỗ trợ FTS5, khó đóng gói)
- Tìm kiếm: SQLite FTS5 trước; embedding/vector chỉ thêm khi được yêu cầu
- AI: Gemini API qua @google/genai, CHỈ gọi từ main process
- Tài liệu: pdfjs-dist (PDF), mammoth (DOCX → text/HTML để đọc nội dung),
  JSZip + fast-xml-parser (đọc XML DOCX để kiểm tra định dạng), docx (xuất báo cáo)
- Test: Vitest
- Đóng gói: electron-builder (NSIS .exe)

## Luật kiến trúc

- Renderer (src/) chỉ là giao diện. Mọi truy cập file, DB, AI, key đều ở main process (electron/).
- BrowserWindow: contextIsolation: true, nodeIntegration: false, sandbox: true.
- preload chỉ expose API có kiểu qua contextBridge (window.nexus.*). Không expose ipcRenderer thô.
- Mọi IPC handler validate input bằng zod và trả về dạng { ok: true, data } | { ok: false, error }.
- Kênh IPC và kiểu dữ liệu định nghĩa một chỗ: shared/ipc-contract.ts.
- Service nghiệp vụ nằm ở electron/services/<module>/, không import lẫn chéo bừa bãi.
- API key lưu bằng Electron safeStorage. Không bao giờ log key, không gửi key sang renderer.
- Không bao giờ ghi đè file gốc của người dùng. Luôn tạo bản sao làm việc hoặc file mới.
- Kiểm tra định dạng DOCX (theo quy tắc, không dùng AI) và phân tích nội dung (AI) là hai luồng riêng.

## Cách làm việc

- Không tạo code giả, dữ liệu mock trong code chạy thật, hoặc nút bấm không có chức năng.
- Không tạo sẵn file rỗng cho module chưa làm.
- Sau khi sửa: chạy `npm run typecheck`, `npm run lint`, `npm test`. Báo kết quả thật.
- Không tuyên bố "đã xong" nếu chưa chạy kiểm tra.
- Giao diện: dark mode, sidebar trái, nội dung rộng, typography gọn, cảm giác phần mềm desktop.
- Trả lời người dùng bằng tiếng Việt.
```

---

## Phần B – Prompt từng giai đoạn

### Prompt 0 – Phân tích & lập kế hoạch (Plan Mode, chưa code)

```
Đọc CLAUDE.md. Tôi muốn xây Nexus Desk 1.0 gồm 4 module:
1. Dashboard: tổng quan dự án, hoạt động gần đây, file mới xử lý, thống kê dùng AI.
2. Document Studio: import DOCX/PDF/TXT, đọc nội dung, kiểm tra định dạng DOCX
   (font, cỡ chữ, heading, giãn dòng, khoảng cách đoạn, lề), phân tích nội dung bằng AI,
   danh sách lỗi, xuất báo cáo, so sánh hai phiên bản tài liệu.
3. Knowledge Hub: thư viện tài liệu theo dự án, tìm kiếm toàn văn (FTS5),
   hỏi đáp RAG có trích dẫn tên file + đoạn nguồn.
4. Prompt Library: CRUD prompt, danh mục, tìm kiếm, sao chép một chạm, lịch sử phiên bản.
(Automation Center để v2, chỉ cần kiến trúc không chặn đường thêm sau này.)

Giai đoạn này CHỈ phân tích và lập kế hoạch, KHÔNG viết code. Hãy đưa ra:
1. Kiến trúc tổng thể (main / preload / renderer / shared) và lý do.
2. Cấu trúc thư mục cụ thể.
3. Trách nhiệm từng module và service, ranh giới giữa chúng.
4. Schema database đầy đủ (bảng, cột, khóa, index, bảng FTS5) và quan hệ.
5. Danh sách kênh IPC và luồng dữ liệu cho 3 tình huống: import DOCX rồi kiểm tra định dạng;
   hỏi đáp RAG có streaming; lưu API key.
6. Cách kiểm tra định dạng DOCX: đọc styles.xml + document.xml, xử lý kế thừa style
   (docDefaults → style → paragraph → run), định nghĩa bộ quy tắc có thể cấu hình.
7. Chiến lược chunking và retrieval cho RAG chỉ dùng FTS5 ở v1.
8. Rủi ro kỹ thuật (native module better-sqlite3 khi đóng gói, PDF scan không có text,
   DOCX phức tạp, giới hạn token Gemini...) và cách giảm.
9. Kế hoạch triển khai theo giai đoạn, mỗi giai đoạn có tiêu chí "xong" kiểm tra được.

Có chỗ nào chưa rõ thì liệt kê câu hỏi cho tôi. Chờ tôi duyệt rồi mới code.
```

> Đọc kỹ kế hoạch. Chỗ nào chưa ưng thì sửa trước khi duyệt. Duyệt xong, bảo Claude lưu kế hoạch vào `docs/ARCHITECTURE.md` để các lượt sau bám theo.

### Prompt 1 – Khởi tạo project

```
Theo docs/ARCHITECTURE.md, làm Giai đoạn 1a: khởi tạo project.
- electron-vite + React + TypeScript strict + Tailwind.
- BrowserWindow bảo mật đúng CLAUDE.md, thêm Content-Security-Policy.
- Layout: sidebar trái (Dashboard, Documents, Knowledge, Prompts, Settings), routing,
  mỗi trang chỉ có tiêu đề (chưa làm chức năng).
- Script: dev, build, typecheck, lint, test (Vitest), có ít nhất 1 test mẫu chạy được.
- .gitignore, git init, commit đầu tiên.
Xong thì chạy `npm run dev` xác nhận cửa sổ mở được, chạy typecheck/lint/test, báo kết quả.
```

### Prompt 2 – Database, IPC, bảo mật (model mạnh)

```
Làm Giai đoạn 1b: nền tảng dữ liệu và IPC.
- better-sqlite3 + Drizzle, DB ở app.getPath('userData'), migration tự chạy khi khởi động.
- Tạo schema theo ARCHITECTURE.md cho các bảng cần ở v1 (gồm cả bảng FTS5).
- shared/ipc-contract.ts: định nghĩa kênh + kiểu. preload expose window.nexus có kiểu.
- Helper đăng ký handler: validate zod, bắt lỗi, trả { ok, data | error }, ghi log.
- Logging ra file trong userData/logs (dùng electron-log).
- Settings service: lưu/đọc/xóa Gemini API key bằng safeStorage; renderer chỉ biết
  "đã có key hay chưa", không bao giờ nhận lại key.
- Trang Settings: nhập key, xóa key, hiện trạng thái.
- Bảng activity_log + service ghi hoạt động (Dashboard sẽ dùng).
Viết test cho: validate IPC, repository cơ bản, mã hóa key. Chạy test và báo kết quả thật.
Kiểm tra lại: renderer không import được bất kỳ module Node nào.
```

### Prompt 3 – Dashboard & giao diện

```
Làm Giai đoạn 1c: Dashboard và hoàn thiện giao diện.
- Quản lý Project (tạo/sửa/xóa) vì tài liệu và prompt đều gắn với project.
- Dashboard lấy dữ liệu THẬT từ SQLite qua IPC: số project, hoạt động gần đây,
  file xử lý gần đây, số lượt gọi AI. Chưa có dữ liệu thì hiện trạng thái trống đẹp.
- Hoàn thiện theme dark: màu, khoảng cách, typography, trạng thái loading/lỗi/trống
  dùng chung thành component.
Không dùng dữ liệu giả. Chạy app, kiểm tra tạo project thì Dashboard cập nhật.
```

### Prompt 4 – Document Studio (model mạnh, có thể chia 2 lượt)

```
Làm Giai đoạn 2: Document Studio. Hai luồng tách riêng.

Luồng A – import & đọc:
- Chọn file qua dialog của main process (renderer không nhận đường dẫn tùy ý).
- Copy file vào thư mục làm việc trong userData, file gốc giữ nguyên.
- Trích text: TXT, DOCX (mammoth), PDF (pdfjs-dist). PDF không có text layer
  thì báo rõ "PDF dạng ảnh, chưa hỗ trợ OCR".
- Lưu metadata + text vào DB, xem trước nội dung trong app.

Luồng B – kiểm tra định dạng DOCX (không dùng AI):
- Đọc word/document.xml và word/styles.xml bằng JSZip + fast-xml-parser.
- Tính định dạng hiệu lực từng đoạn theo kế thừa docDefaults → style → paragraph → run.
- Bộ quy tắc cấu hình được (lưu DB, có 1 preset mặc định, ví dụ Times New Roman 13pt,
  giãn dòng 1.5, lề chuẩn văn bản hành chính VN), kiểm tra: font, cỡ chữ, heading
  đúng cấp, giãn dòng, khoảng cách đoạn, lề trang.
- Kết quả: danh sách lỗi (vị trí đoạn, trích dẫn ngắn, giá trị thực tế, giá trị mong muốn).
- Xuất báo cáo ra DOCX (thư viện docx) và Markdown, lưu thành file mới.

Viết test với vài file DOCX mẫu tự tạo trong tests/fixtures (có style kế thừa, có run
ghi đè font). Chạy test, báo kết quả. Chưa làm phân tích AI ở lượt này.
```

### Prompt 5 – Tích hợp Gemini

```
Làm Giai đoạn 3: AI service trong main process.
- @google/genai, đọc key từ settings service; chưa có key thì trả lỗi rõ ràng.
- Hỗ trợ streaming sang renderer qua IPC (gửi từng chunk, có huỷ được).
- Timeout, retry có giới hạn cho lỗi tạm thời, map lỗi API thành thông báo tiếng Việt.
- Đếm token / cắt văn bản dài theo giới hạn, ghi mỗi lượt gọi vào bảng ai_usage.
- Prompt template cho từng tác vụ đặt trong electron/services/ai/templates.
- Gắn vào Document Studio: nút "Phân tích nội dung bằng AI" (lỗi chính tả, văn phong,
  logic, tóm tắt), kết quả hiển thị riêng với lỗi định dạng và đưa được vào báo cáo.
Test service bằng mock client (mock chỉ trong test). Chạy thử thật với key của tôi.
```

### Prompt 6 – Knowledge Hub & RAG (model mạnh)

```
Làm Giai đoạn 4: Knowledge Hub.
- Thêm tài liệu vào thư viện (dùng lại luồng import của Document Studio, không viết lại),
  gắn project, gắn tag.
- Chia chunk có chồng lấn, lưu vị trí nguồn (file, trang/đoạn), index vào FTS5.
- Tìm kiếm toàn văn có highlight, lọc theo project.
- Hỏi đáp: lấy top-k chunk bằng FTS5 (bm25), đưa vào Gemini, stream câu trả lời,
  bắt buộc trích dẫn [n] trỏ về file + đoạn. Bấm vào trích dẫn mở được đoạn nguồn.
  Không tìm thấy nguồn liên quan thì trả lời "không có trong tài liệu", không bịa.
- Xóa tài liệu thì xóa luôn chunk và index.
Test chunking và retrieval. Thử với 5–10 tài liệu thật, báo chất lượng truy hồi.
```

### Prompt 7 – Prompt Library

```
Làm Giai đoạn 5: Prompt Library.
- CRUD prompt: tiêu đề, nội dung, danh mục, tag, project (tuỳ chọn).
- Mỗi lần sửa tạo phiên bản mới, xem lịch sử và khôi phục bản cũ.
- Tìm kiếm (FTS5), lọc theo danh mục/tag, sao chép một chạm có thông báo.
- Hỗ trợ biến dạng {{ten_bien}}: khi dùng, hiện form điền biến rồi mới sao chép.
Test repository + versioning. Chạy app kiểm tra toàn luồng.
```

### Prompt 8 – Hoàn thiện & đóng gói (model mạnh)

```
Làm Giai đoạn 6: hoàn thiện và đóng gói Windows.
- electron-builder NSIS, rebuild native module better-sqlite3 đúng phiên bản Electron,
  icon, tên app, thư mục cài đặt.
- Build ra .exe, cài thử, kiểm tra: mở app, tạo DB mới, import DOCX/PDF, kiểm tra định dạng,
  gọi AI, RAG, prompt library đều chạy trong bản đã cài (không chỉ trong dev).
- Rà soát bảo mật: cài đặt BrowserWindow, CSP, mọi IPC handler đều validate,
  key không xuất hiện trong log, bundle renderer hay file cài đặt.
- Kiểm tra hiệu năng: import 100 file, tìm kiếm, khởi động app.
Đối chiếu checklist nghiệm thu bên dưới, báo từng mục: đạt / chưa đạt / lý do.
```

Checklist nghiệm thu 1.0:

- [ ] Cài được trên Windows bằng .exe
- [ ] Dashboard hiển thị dữ liệu thật từ SQLite
- [ ] Import và đọc được DOCX, PDF, TXT
- [ ] Kiểm tra được quy tắc định dạng DOCX
- [ ] AI phân tích tài liệu và tạo báo cáo
- [ ] Xuất báo cáo, không làm mất file gốc
- [ ] Tìm kiếm và hỏi đáp tài liệu có trích dẫn nguồn
- [ ] Lưu, sửa, xóa, tìm kiếm prompt
- [ ] API key lưu an toàn
- [ ] Có kiểm thử và xử lý lỗi cơ bản

---

## Phần C – Prompt kiểm tra (gửi sau mỗi giai đoạn)

```
Kiểm tra toàn bộ phần vừa làm, không chỉ xem code có chạy hay không:
1. Chức năng đã thực sự hoạt động chưa? Chạy app và thử từng luồng.
2. Có vi phạm luật trong CLAUDE.md hoặc lệch docs/ARCHITECTURE.md không?
3. Có code trùng lặp, service ôm quá nhiều trách nhiệm không?
4. Có lỗi bảo mật, rò rỉ API key, IPC thiếu validate không?
5. Xử lý dữ liệu và ngoại lệ đã đủ chưa (file hỏng, file rỗng, file rất lớn)?
6. Có làm hỏng module khác không? Chạy lại toàn bộ test.

Sửa lỗi có căn cứ, rồi báo: file đã sửa, hàm đã sửa, nguyên nhân, kết quả test thật,
vấn đề chưa giải quyết. Không tuyên bố thành công nếu chưa kiểm tra.
```

---

## Mẹo khi làm với Claude Code

- Mỗi giai đoạn một phiên mới (`/clear`) để ngữ cảnh gọn. CLAUDE.md và ARCHITECTURE.md giữ kiến thức chung.
- Commit sau mỗi giai đoạn đạt. Hỏng thì quay lại commit trước, đừng sửa chồng lên.
- Claude hỏi quyền chạy lệnh thì đọc lệnh trước khi bấm cho phép.
- Gặp lỗi thì dán nguyên thông báo lỗi và bước tái hiện, đừng chỉ nói "nó lỗi".

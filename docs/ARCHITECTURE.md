# Kiến trúc Nexus Desk

## Ba phần của app Electron

```
┌──────────────────────────┐   window.nexus.*   ┌──────────────┐   ipcRenderer.invoke   ┌──────────────────────────────┐
│ Renderer (giao diện)     │ ─────────────────▶ │ Preload      │ ─────────────────────▶ │ Main process                 │
│ React, src/renderer      │                    │ src/preload  │                        │ src/main                     │
│ KHÔNG có Node.js         │ ◀───────────────── │ (cửa duy nhất)│ ◀───────────────────── │ ipc/ → services/ → db/       │
└──────────────────────────┘   Result<T>        └──────────────┘                        │ file, database, AI, API key  │
                                                                                         └──────────────────────────────┘
```

- **Renderer**: chỉ vẽ giao diện. Không đọc file, không gọi database, không giữ API key.
- **Preload**: mở đúng các hàm khai báo trong `NexusApi`, không mở `ipcRenderer` thô.
- **Main**: làm mọi việc "thật". Mỗi lời gọi đi qua `ipc/handler.ts`:
  kiểm tra nguồn gọi → kiểm tra dữ liệu bằng zod → chạy service → bắt lỗi → trả `Result`.

## Thư mục

```
src/
  shared/            Dùng chung cho cả 3 phần
    channels.ts        Tên kênh IPC (không import thư viện, để preload dùng được)
    ipc-contract.ts    Schema zod, kiểu dữ liệu, interface NexusApi
  main/
    index.ts           Khởi động: mở DB, tạo service, đăng ký IPC, mở cửa sổ
    window.ts          Cửa sổ chính + cấu hình bảo mật
    logger.ts          Ghi nhật ký ra file
    errors.ts          UserError: lỗi được phép hiện cho người dùng
    db/                schema.ts (bảng), client.ts (mở DB + migration)
    ipc/               handler.ts (bọc an toàn), register.ts (đăng ký các kênh)
    services/<module>/ Nghiệp vụ từng module
  preload/             index.ts (window.nexus), index.d.ts (kiểu cho renderer)
  renderer/src/
    components/        ui.tsx, icons.tsx, layout/
    pages/<Trang>/     Mỗi trang một thư mục
    hooks/, lib/       Hàm tiện ích dùng chung
drizzle/               Migration SQL do drizzle-kit sinh ra (đóng gói kèm app)
tests/                 Test Vitest (chạy bằng Node, database trong bộ nhớ)
```

## Database

File: `%APPDATA%\Nexus Desk\nexus-desk.db` (SQLite, chế độ WAL, bật khóa ngoại).
Thời gian lưu dạng số mili-giây (`Date.now()`).

### Đã có (GĐ 1)

| Bảng           | Cột chính                                                       | Ghi chú                              |
| -------------- | --------------------------------------------------------------- | ------------------------------------ |
| `projects`     | id, name, description, created_at, updated_at                   | Nhóm tài liệu/prompt theo môn, đồ án |
| `activity_log` | id, type, message, project_id → projects (set null), created_at | Xóa dự án không xóa nhật ký cũ       |

### Đã có (GĐ 2A)

| Bảng            | Cột chính                                                                                                                                      | Ghi chú                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `documents`     | id, project_id, name, kind, size_bytes, sha256, source_path, stored_file, extract_status, extract_message, char_count, page_count, imported_at | Trùng sha256 thì bỏ qua khi nhập          |
| `document_text` | document_id (cascade), content                                                                                                                 | Chữ trích ra, tách bảng vì có thể rất lớn |

Bản sao tài liệu: `%APPDATA%\Nexus Desk\documents\<uuid>.<kind>`. Xóa tài liệu chỉ xóa bản sao.
Đường dẫn file do main lấy từ hộp thoại Windows, renderer không bao giờ gửi đường dẫn.
Kiểm thử tự động khi dev: `NEXUS_E2E_PICK="C:\a.docx|C:\b.pdf"` thay cho hộp thoại (bị bỏ qua khi app.isPackaged).

### Đã có (GĐ 2B + mẫu định dạng)

| Bảng               | Cột chính                                                                                                      | Ghi chú                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `settings`         | key, value (JSON), updated_at                                                                                  | Dành cho GĐ 3 (API key). Không còn dùng cho quy tắc |
| `format_templates` | id, name, is_default, source_name, spec_json (TemplateSpec), learned_json, created/updated                     | Khởi động tự tạo "Chuẩn báo cáo sinh viên"          |
| `format_checks`    | id, document_id (cascade), template_id (set null), template_name, rules_json (= spec), stats_json, issues_json | Lưu cả spec lúc kiểm tra để báo cáo đúng            |

### Kiểm tra định dạng DOCX theo mẫu (`src/main/services/format/`)

- **Mẫu (TemplateSpec, src/shared/format.ts)**: thông số riêng cho thân bài, Heading 1–4
  (cấp sâu hơn dùng Heading 4), chú thích; lề trang; thứ tự heading. Mỗi thuộc tính null =
  không kiểm tra; số dạng khoảng {min,max}. Sai số: 0,05 pt cỡ chữ, 0,05 bội số dòng, 0,5 pt, 0,1 cm.
- `docx-model.ts`: mở zip, đọc `document.xml`, `styles.xml`, `theme/theme1.xml`; tính định dạng
  hiệu lực theo tầng docDefaults → style (chuỗi basedOn) → pPr/rPr trực tiếp; font theme
  (minorHAnsi...) tra trong theme. Nhận biết heading, bảng, mục lục, danh sách, section, lề.
- `paragraph-facts.ts`: `classifyAll` phân loại đoạn: heading / chú thích (style Caption,
  "Hình/Bảng N" ngắn hoặc căn giữa, dòng ngắn căn giữa) / bảng / trang bìa (dòng ngắn trước
  mục lục hoặc heading đầu tiên) / thân bài. Bảng và trang bìa chỉ xét font.
- `check.ts`: so từng đoạn với thông số của loại đoạn tương ứng. Thân bài: căn lề và thụt dòng
  chỉ xét đoạn ≥ 80 ký tự, không phải danh sách. Lỗi lề trang gộp các section giống nhau.
- `learn.ts`: học mẫu từ DOCX — với mỗi loại đoạn lấy giá trị phổ biến nhất (trọng số theo
  độ dài chữ); cảnh báo khi < 3 đoạn thân bài, không có heading, hoặc giá trị chiếm < 60%.
- `template-service.ts`: CRUD mẫu, mặc định, không cho xóa mẫu cuối cùng.
- `report.ts`: xuất Markdown và DOCX. `format-service.ts`: chặn ghi báo cáo đè file gốc/bản sao.
- `fix.ts` (tự sửa): `openDocx` giữ cây XML + node của từng đoạn/cụm chữ/section; sửa trực tiếp
  w:rFonts / w:sz / w:b / w:spacing / w:jc / w:ind / w:pgMar cho chỗ đang SAI (giá trị khoảng →
  điểm gần nhất), chèn phần tử đúng thứ tự schema OOXML (PPR_ORDER, RPR_ORDER, SECT_ORDER), ghi
  lại bằng `buildXml`, xuất FILE MỚI rồi tự nhập vào thư viện. Bảng / trang bìa chỉ sửa font;
  danh sách không đổi thụt dòng; không sửa được thứ tự heading. Đã mở thử kết quả bằng Word thật.
- Đã thử: file Word 365 thật; tình huống "mẫu khách hàng" (Arial 12, 1,15, H1 căn giữa):
  học đúng, bài làm đúng mẫu 0 lỗi, bài sai mẫu bắt đủ 16 lỗi; báo cáo thật 613 đoạn: 0,12 s.
- Kiểm thử tự động khi dev: `NEXUS_E2E_SAVE_DIR`, `NEXUS_E2E_PICK_TEMPLATE` thay cho hộp thoại.

### Đã có (GĐ 3 – Gemini)

| Bảng          | Cột chính                                                                                | Ghi chú                                |
| ------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `ai_usage`    | task, model, document_id (set null), input/output_tokens, duration_ms, status, error     | status: ok / error / cancelled         |
| `ai_analyses` | document_id (cascade), task, model, content (Markdown), truncated, created_at            | Giao diện hiện bản mới nhất mỗi tác vụ |
| `settings`    | `ai.apiKey` (base64 của bản mã hóa safeStorage/DPAPI), `ai.model` (null = tự chọn Flash) | Key không bao giờ rời main process     |

AI (`src/main/services/ai/`):

- `gemini-client.ts`: bọc `@google/genai` sau interface `AiClient` (test dùng client giả).
- `key-store.ts`: mã hóa key bằng `safeStorage`; giải mã thất bại (chép DB sang máy khác) → báo nhập lại.
- `ai-service.ts`: tự chọn model `gemini-X.Y-flash` mới nhất từ `models.list` (lưu vào `ai.model`);
  stream qua IPC (`ai:chunk` main → renderer, kèm requestId); hủy bằng AbortController; tự dừng nếu
  im lặng 90 giây; đổi lỗi 400/403/404/429/5xx/mạng sang tiếng Việt; ghi `ai_usage` mọi lượt.
- `prompts.ts`: 3 tác vụ (tổng quan, chính tả, văn phong). Tài liệu bọc trong `<tai_lieu>`, system
  prompt dặn bỏ qua chỉ dẫn bên trong tài liệu (chống prompt injection). Cắt tại 100.000 ký tự.
- IPC handler nhận `ctx.send` để gửi sự kiện về đúng cửa sổ đã gọi.
- Giao diện hiện câu trả lời bằng bộ Markdown tự viết (`lib/markdown.ts`), không có HTML thô.

### Thư mục file kết quả

- `services/settings/output-dir.ts`: setting `output.dir` (không có = `Documents\file báo cáo lưu trữ`,
  tự tạo nếu thiếu). Mọi hộp thoại "Lưu thành" (tự sửa, xuất báo cáo, hoàn thiện) mở sẵn ở đây.
- Kênh `app:reveal-file` chỉ mở Explorer cho file app vừa lưu trong phiên (danh sách `remember`),
  renderer không mở được đường dẫn tùy ý.

### Dự kiến (tạo khi tới giai đoạn tương ứng)

| Bảng                   | GĐ  | Mục đích                                                 |
| ---------------------- | --- | -------------------------------------------------------- |
| `prompts`              | 4   | Prompt: tiêu đề, danh mục, tag, project_id               |
| `prompt_versions`      | 4   | Lịch sử phiên bản nội dung prompt                        |
| `prompts_fts`          | 4   | Bảng FTS5 để tìm kiếm prompt                             |
| `knowledge_chunks`     | 5   | Đoạn văn bản cắt từ tài liệu + vị trí nguồn (trang/đoạn) |
| `knowledge_chunks_fts` | 5   | Bảng FTS5 để truy hồi đoạn liên quan khi hỏi đáp         |

### Thêm/sửa bảng

1. Sửa `src/main/db/schema.ts`
2. `npm run db:generate -- --name <ten-thay-doi>` → sinh file SQL trong `drizzle/`
3. Khởi động app: migration tự chạy. Không bao giờ sửa file migration đã commit.
   Bảng FTS5 Drizzle không tự sinh được → thêm bằng migration SQL viết tay (`drizzle-kit generate --custom`).

## Lưu ý môi trường (máy Windows có Smart App Control)

- Smart App Control chặn các file `.node` chưa có chữ ký và chưa đủ "danh tiếng".
  Bản rolldown đi kèm vite 8.4 bị chặn → ghim `vite` ở `8.3.8`.
  Khi nâng cấp thư viện build, chạy `npx electron-vite build` để kiểm tra ngay.
- `better-sqlite3` 13 có sẵn file dựng sẵn dạng Node-API, chạy chung được cho Node và Electron
  → không dùng `electron-builder install-app-deps` (nó cố biên dịch lại và đòi Visual Studio).

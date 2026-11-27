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

### Dự kiến (tạo khi tới giai đoạn tương ứng)

| Bảng                   | GĐ  | Mục đích                                                                |
| ---------------------- | --- | ----------------------------------------------------------------------- |
| `documents`            | 2   | File đã nhập: tên, loại, đường dẫn bản sao làm việc, hash, project_id   |
| `document_text`        | 2   | Nội dung text trích ra (tách riêng vì có thể rất lớn)                   |
| `format_rule_sets`     | 2   | Bộ quy tắc định dạng (JSON), có preset báo cáo sinh viên                |
| `format_checks`        | 2   | Một lần kiểm tra: document_id, rule_set_id, thời điểm, số lỗi           |
| `format_issues`        | 2   | Từng lỗi: vị trí đoạn, trích dẫn, giá trị thực tế, giá trị mong muốn    |
| `settings`             | 3   | Cài đặt dạng key/value. API key mã hóa bằng safeStorage                 |
| `ai_usage`             | 3   | Mỗi lượt gọi AI: tác vụ, model, token vào/ra, thời gian, thành công/lỗi |
| `ai_analyses`          | 3   | Kết quả AI phân tích tài liệu                                           |
| `prompts`              | 4   | Prompt: tiêu đề, danh mục, tag, project_id                              |
| `prompt_versions`      | 4   | Lịch sử phiên bản nội dung prompt                                       |
| `prompts_fts`          | 4   | Bảng FTS5 để tìm kiếm prompt                                            |
| `knowledge_chunks`     | 5   | Đoạn văn bản cắt từ tài liệu + vị trí nguồn (trang/đoạn)                |
| `knowledge_chunks_fts` | 5   | Bảng FTS5 để truy hồi đoạn liên quan khi hỏi đáp                        |

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

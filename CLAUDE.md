# Nexus Desk – Personal AI Workspace

App desktop Windows cá nhân cho sinh viên / người học lập trình: kiểm tra định dạng báo cáo DOCX,
phân tích nội dung bằng AI, thư viện prompt, kho tài liệu hỏi đáp (RAG).
Dữ liệu lưu cục bộ, không có tài khoản người dùng, không có server.

## Người dùng

Chủ dự án là sinh viên, chưa rành code, bận rộn. Từ GĐ 2 (27/11/2026) Claude làm toàn quyền:

- Tự lập kế hoạch và triển khai, không dừng chờ duyệt từng bước. Người dùng chỉ review app.
- Xong mỗi mốc dùng được: báo ngắn bằng tiếng Việt (có gì mới, cách thử, còn gì chưa làm).
- Chỉ dừng hỏi khi cần người dùng thật sự: nhập API key, cài phần mềm lớn, đụng cài đặt bảo mật
  của máy, hoặc thay đổi phạm vi tính năng.
- Không cập nhật docs/SO-TAY-HOC.md nữa (giữ làm tư liệu). Vẫn cập nhật docs/ARCHITECTURE.md.

## Stack (không tự ý thêm công nghệ khác, cần thêm thì hỏi trước)

- Electron + electron-vite, React + TypeScript (strict), Tailwind CSS
- SQLite qua better-sqlite3 + Drizzle ORM (không dùng Prisma: không hỗ trợ FTS5, khó đóng gói)
- Tìm kiếm: SQLite FTS5 trước; embedding/vector chỉ thêm khi thực sự cần
- AI: Gemini API qua @google/genai, CHỈ gọi từ main process
- Tài liệu: pdfjs-dist (PDF), mammoth (đọc nội dung DOCX),
  JSZip + fast-xml-parser (đọc XML DOCX để kiểm tra định dạng), docx (xuất báo cáo)
- Test: Vitest. Đóng gói: electron-builder (NSIS .exe)

## Luật kiến trúc

- Renderer chỉ là giao diện. Truy cập file, DB, AI, key đều ở main process.
- BrowserWindow: contextIsolation: true, nodeIntegration: false, sandbox: true, có CSP.
- preload chỉ expose API có kiểu qua contextBridge (window.nexus.*), không expose ipcRenderer thô.
- Mọi IPC handler validate input bằng zod, trả { ok: true, data } | { ok: false, error }.
- Kênh IPC ở src/shared/channels.ts (không import thư viện); schema zod, kiểu dữ liệu và
  interface NexusApi ở src/shared/ipc-contract.ts. Preload chỉ được `import type` từ ipc-contract.
- Thêm kênh IPC mới: channels.ts → ipc-contract.ts (schema + NexusApi) → service → ipc/register.ts → preload.
- Lỗi được phép hiện cho người dùng thì ném UserError; lỗi khác handler tự ẩn và ghi log.
- Kiến trúc chi tiết, database và lưu ý môi trường: docs/ARCHITECTURE.md.
- API key lưu bằng Electron safeStorage. Không log key, không gửi key sang renderer.
- Không bao giờ ghi đè file gốc của người dùng.
- Kiểm tra định dạng DOCX (theo quy tắc) và phân tích nội dung (AI) là hai luồng riêng.

## Cách làm việc

- Không code giả, không dữ liệu mock trong code chạy thật, không nút bấm không có chức năng.
- Không tạo sẵn file rỗng cho module chưa làm.
- Sau khi sửa: chạy `npm run check` (typecheck + lint + test) và báo kết quả thật.
  Chưa kiểm tra thì không nói "xong".
- Máy có Smart App Control: không tắt nó. Nâng cấp vite/electron-vite thì chạy
  `npx electron-vite build` kiểm tra ngay (xem docs/ARCHITECTURE.md).
- Commit sau mỗi bước chạy được.
- Giao diện: dark mode, sidebar trái, nội dung rộng, cảm giác phần mềm desktop.

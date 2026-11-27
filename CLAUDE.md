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

## Tiến độ (cập nhật mỗi khi xong một mốc, để làm tiếp sau khi nén hội thoại)

Cập nhật lần cuối: 27/11/2026. Bảng giai đoạn chi tiết: docs/KE-HOACH.md.

**Đã xong, đã kiểm thử (139 test xanh):**

- GĐ0–2: khung app, IPC an toàn, dự án, tài liệu (PDF/DOCX/TXT/MD), kiểm tra định dạng DOCX,
  xuất báo cáo lỗi.
- Mẫu định dạng: học từ file mẫu của khách/trường, sửa tay, đặt mặc định.
- Tự sửa định dạng theo mẫu → lưu bản sao (không đụng file gốc).
- GĐ3 Gemini: nhận xét nội dung (stream), chọn model Tự động / Cố định (người dùng đang để cố định
  gemini-3.6-flash), dự phòng khi 503/429/timeout. Người dùng đã thử với key thật: chạy được.
- Hoàn thiện báo cáo: sửa định dạng + AI hiệu đính câu chữ, ghi bằng Track Changes
  (author "Nexus Desk AI"). Người dùng đã thử trong Word, đạt.
- Thư mục kết quả: mặc định `Tài liệu\file báo cáo lưu trữ` (người dùng đã tự tạo), hộp thoại Lưu
  mở sẵn ở đó, đổi được trong Cài đặt, nút "Mở thư mục chứa file" sau mỗi lần lưu.
- GĐ4 Thư viện prompt: trang `/prompts` (tìm FTS5 không dấu, danh mục, tag, dự án, lịch sử phiên
  bản + khôi phục, nhân bản, sao chép), 4 prompt mẫu, chạy prompt trên tài liệu ở ô "Prompt của
  tôi" (tab Phân tích AI). Đã chạy thật với Gemini. Người dùng chưa review.

**Việc tiếp theo (theo thứ tự):**

1. GĐ5 Kho tài liệu + hỏi đáp RAG có trích nguồn (FTS5 trước, chưa dùng embedding).
2. GĐ6 Dashboard thống kê (trang Tổng quan hiện chỉ có dự án + hoạt động gần đây), đóng gói .exe.

Chỉ là định hướng, CHƯA làm khi người dùng chưa yêu cầu: mục lục, danh mục hình/bảng, từ viết tắt,
ngắt trang, đánh số trang (ghi ở docs/KE-HOACH.md).

**Dữ liệu và thói quen của người dùng:**

- File đầu vào (file của họ, mẫu của khách) nằm trong Downloads: chỉ đọc, không sửa, không di chuyển.
- Không xóa DB thật ở `%APPDATA%\Nexus Desk`. Dữ liệu thử do Claude tạo thì xóa qua API của app.
- API key do người dùng tự nhập trong Cài đặt. Không hỏi, không xem, không log key.

**Lưu ý môi trường khi làm (máy Windows này):**

- Mỗi lệnh PowerShell mới phải nạp lại PATH trước (không thì không thấy git/node):
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- Không dùng Get-Content/Set-Content để sửa file có tiếng Việt (hỏng mã hóa); dùng công cụ Edit/Write.
  File .ps1 có tiếng Việt cần BOM. Commit message tiếng Việt: viết ra file (không BOM) rồi `git commit -F`.
- Trước khi chạy app: tắt hết tiến trình electron cũ (khóa single-instance).
- Thử UI tự động: `electron-vite dev --remoteDebuggingPort 9333` + script CDP; hook E2E
  (NEXUS_E2E_PICK, NEXUS_E2E_SAVE_DIR, NEXUS_E2E_PICK_TEMPLATE) chỉ chạy khi chưa đóng gói.
  Xong phải mở lại app bình thường, không còn biến E2E (người dùng hay dùng chung cửa sổ đó).
- Word COM (tạo/kiểm file DOCX thật) chạy trong Start-Job có timeout, không sửa style khi Word ẩn.
- GitHub: repo riêng tư github.com/namtr-n/NexusDesk. Git HTTPS bị Smart App Control chặn (libcurl
  chưa ký) → push qua SSH (`core.sshCommand` = OpenSSH của Windows, key `~/.ssh/id_ed25519`).
  Commit xong thì `git push`.

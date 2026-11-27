# Sổ tay học – Nexus Desk

Mỗi giai đoạn, các khái niệm mới được ghi vào đây bằng lời đơn giản. Đọc lại khi quên.

---

## Bài 0 – Chuẩn bị môi trường

### Terminal (PowerShell)

Cửa sổ gõ lệnh bằng chữ thay vì bấm chuột. Lập trình viên dùng nó để cài thư viện, chạy app, chạy test.
Trong VS Code mở bằng menu **Terminal → New Terminal** (hoặc `Ctrl + ` `).

### Node.js và npm

- **Node.js**: chương trình giúp chạy JavaScript/TypeScript trên máy tính (không chỉ trong trình duyệt).
  Electron, công cụ build, test đều cần nó.
- **npm**: "kho ứng dụng" cho thư viện JavaScript. `npm install` tải thư viện về thư mục `node_modules`.
- File `package.json` ghi project dùng những thư viện nào và có những lệnh nào (`npm run dev`, `npm test`…).

### Git

Công cụ **lưu lịch sử thay đổi** của code. Giống "Save game" trong game:

- **commit** = một lần lưu, có ghi chú "đã làm gì". Làm hỏng thì quay về commit trước.
- **diff** = so sánh khác biệt giữa hai lần lưu (dòng nào thêm, dòng nào xóa).
- **.gitignore** = danh sách file Git bỏ qua (thư viện tải về, file chứa bí mật, file build).

Lệnh hay dùng:

```powershell
git status        # đang có file nào thay đổi chưa lưu
git log --oneline # xem danh sách các lần commit
git diff          # xem chi tiết thay đổi chưa commit
```

### Vì sao project không để trong OneDrive

OneDrive đồng bộ từng file lên mạng. Project lập trình có hàng chục nghìn file thư viện,
OneDrive sẽ đồng bộ liên tục và có lúc khóa file làm build lỗi. Nên để ở `C:\Users\<tên>\Projects`.

### CLAUDE.md

File "nội quy dự án" cho AI. Claude Code tự đọc nó mỗi lần mở project, nên các luật
(dùng công nghệ gì, bảo mật thế nào, làm việc ra sao) không bị quên giữa các phiên.
**Bài học dùng AI #1:** viết luật một lần vào file, đừng nhắc lại trong từng tin nhắn.

### API key là gì

Một chuỗi ký tự bí mật giống **mật khẩu cho phần mềm**. Khi app gọi Gemini, nó gửi kèm key để Google biết
"ai đang gọi" và trừ vào quota của tài khoản đó.

- Ai có key thì dùng được quota của bạn → **không dán key vào chat, không đưa lên GitHub, không chụp màn hình**.
- Lộ key thì vào Google AI Studio xóa key cũ, tạo key mới.
- Trong Nexus Desk, key sẽ được nhập ở trang Settings và mã hóa bằng cơ chế bảo mật của Windows.

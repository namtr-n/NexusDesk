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

---

## Bài 1 – Khung app

### Ba phần của một app Electron (ví dụ nhà hàng)

- **Renderer** = phòng ăn: thứ người dùng nhìn thấy (giao diện React). Khách **không được vào bếp**.
- **Main process** = nhà bếp: làm việc thật (đọc file, ghi database, gọi AI, giữ API key).
- **Preload** = quầy gọi món: cửa duy nhất giữa hai bên, chỉ nhận đúng những món có trong thực đơn.
- **IPC** (Inter-Process Communication) = tờ phiếu gọi món chuyền qua quầy.

Vì sao phải tách? Nếu giao diện dùng thẳng được Node.js, chỉ một đoạn mã độc lọt vào giao diện là
nó có thể xóa file hoặc đọc API key của bạn. Tách ra thì giao diện chỉ "gọi món" được.

### Validate (kiểm tra dữ liệu) với zod

Không bao giờ tin dữ liệu gửi tới. Mỗi phiếu gọi món đều được kiểm tra trước:
tên dự án rỗng? dài quá 100 ký tự? không phải chữ? → trả lỗi ngay, không chạy tiếp.
Cùng một bộ quy tắc (schema) dùng cho cả form trên giao diện lẫn main process.

### Database, bảng, migration

- **Database (SQLite)**: một file `.db` chứa dữ liệu, giống file Excel có nhiều sheet.
- **Bảng**: một "sheet", ví dụ bảng `projects` có cột id, tên, mô tả, thời gian.
- **Migration**: file SQL mô tả "thay đổi cấu trúc database". App tự chạy migration còn thiếu khi khởi động,
  nên máy nào cũng có database đúng cấu trúc. Đã commit rồi thì không sửa, muốn đổi thì tạo migration mới.
- **Transaction**: gom nhiều thao tác thành một khối "cùng thành công hoặc cùng thất bại"
  (tạo dự án + ghi nhật ký: không bao giờ có chuyện chỉ xong một nửa).

### Test tự động

Đoạn code kiểm tra code. Ví dụ: "tạo dự án tên ' Đồ án ' thì tên lưu phải là 'Đồ án'".
Chạy `npm test` mất 2 giây, kiểm tra lại 13 tình huống. Sau này sửa code mà lỡ làm hỏng gì, test sẽ báo ngay.

`npm run check` = chạy cả 3 bước kiểm tra:

- **typecheck**: TypeScript soát lỗi kiểu (truyền số vào chỗ cần chữ...).
- **lint**: ESLint soát lỗi hay gặp và quy ước viết code.
- **test**: chạy các test tự động.

### Bài học dùng AI #2: AI cũng gặp sự cố, và cách xử lý đúng

Trong giai đoạn này có hai sự cố thật:

1. `better-sqlite3` đòi cài Visual Studio. AI đã **điều tra trước** và phát hiện bước biên dịch là thừa,
   thay vì bắt bạn cài vài GB phần mềm.
2. **Smart App Control** của Windows chặn một file của công cụ build. AI **không tắt bảo mật của máy bạn**
   mà tìm ra phiên bản thư viện chạy được.

Khi giao việc cho AI, hãy để ý: nó có **điều tra nguyên nhân** không, hay chỉ "thử bừa đến khi chạy"?
Nó có **hỏi bạn** trước khi đụng vào thứ quan trọng (cài phần mềm lớn, đổi cài đặt bảo mật) không?

### Code review: đọc thay đổi của AI

Bạn không cần hiểu hết từng dòng. Khi review, hãy hỏi 3 câu:

1. Thay đổi có **đúng phạm vi** đã duyệt không (có tự thêm thứ không được yêu cầu không)?
2. AI có **bằng chứng** là nó chạy không (kết quả test, ảnh chụp, log), hay chỉ nói "xong rồi"?
3. Có gì AI **nói là chưa làm / chưa kiểm tra** không?

Xem thay đổi của một commit: `git show --stat HEAD` (danh sách file) hoặc mở tab Source Control trong VS Code.

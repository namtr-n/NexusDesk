# Nexus Desk

App trên Windows giúp **kiểm tra, sửa và hoàn thiện báo cáo Word (.docx)**, có AI hỗ trợ.

- **Kiểm tra định dạng** theo quy định của trường / khách (font, cỡ chữ, giãn dòng, lề, tiêu đề…).
- **Tự sửa định dạng** theo mẫu, lưu ra file mới. **File gốc của bạn không bao giờ bị sửa.**
- **Hoàn thiện câu chữ bằng AI**: sửa chính tả, văn phong; mọi chỗ sửa được đánh dấu trong Word để
  bạn tự chấp nhận / từ chối.
- **Phân tích AI**: nhận xét tổng quan, chỉ lỗi chính tả, góp ý văn phong.
- **Thư viện prompt**: lưu sẵn các yêu cầu hay nhờ AI (câu hỏi phản biện, dàn ý slide, tóm tắt…).

Dữ liệu nằm trên máy bạn. Không cần tài khoản.

---

## Phần 1 — Cài đặt (làm một lần)

### Bước 1: Cài Node.js

Vào <https://nodejs.org>, tải bản **LTS**, mở file vừa tải và bấm **Next** liên tục tới khi xong.

### Bước 2: Tải app về

1. Vào <https://github.com/namtr-n/NexusDesk>.
2. Bấm nút xanh **Code** → **Download ZIP**.
3. Chuột phải file ZIP vừa tải → **Extract All…** (Giải nén) → chọn nơi giải nén, ví dụ `C:\`.
   Không giải nén vào thư mục OneDrive (OneDrive hay khóa file làm app lỗi).
4. Mở thư mục vừa giải nén → **bấm tiếp vào thư mục con `NexusDesk-main`**. Đúng chỗ là khi bạn
   thấy các file `package.json` và `README.md`.

### Bước 3: Mở PowerShell đúng thư mục

Đang đứng trong thư mục `NexusDesk-main` (thấy `package.json`):

1. Bấm vào **thanh địa chỉ** phía trên cửa sổ (chỗ hiện đường dẫn thư mục).
2. Xóa hết, gõ `powershell` rồi nhấn **Enter**.
3. Cửa sổ xanh/đen PowerShell hiện ra.

### Bước 4: Cài thư viện (chỉ lần đầu)

Trong PowerShell, gõ lệnh sau rồi nhấn **Enter**, chờ tới khi chạy xong (1–3 phút):

```powershell
npm install
```

---

## Phần 2 — Mở app (mỗi lần dùng)

1. Mở thư mục `NexusDesk-main` → thanh địa chỉ → gõ `powershell` → **Enter** (như Bước 3).
2. Gõ:

   ```powershell
   npm run dev
   ```

3. Chờ 5–10 giây, cửa sổ **Nexus Desk** hiện ra.

**Không tắt cửa sổ PowerShell khi đang dùng app** (tắt là app tắt theo). Dùng xong thì đóng cửa sổ
app là được.

---

## Phần 3 — Nhập Gemini API key (để dùng tính năng AI)

Không có key vẫn dùng được kiểm tra và tự sửa định dạng. Muốn dùng AI:

1. Vào <https://aistudio.google.com/apikey>, đăng nhập Google → **Create API key** → **Copy**.
2. Trong app: menu trái **Cài đặt** → dán key vào ô **Nhập API key** → **Lưu key**.
3. Bấm **Kiểm tra kết nối**: hiện tên model là dùng được.

Key được mã hóa và chỉ lưu trên máy bạn. **Dùng key của chính bạn, không đưa key cho người khác.**

---

## Phần 4 — Cách dùng

### Kiểm tra và sửa định dạng (không cần AI)

1. Menu trái **Tài liệu** → **Mở tài liệu** → chọn file báo cáo `.docx`.
   App chỉ chép một bản vào kho của nó, file gốc giữ nguyên.
2. Bấm vào tài liệu vừa thêm → tab **Kiểm tra định dạng** → chọn **mẫu** → **Kiểm tra**.
   App liệt kê từng lỗi và vị trí. Bấm **Xuất báo cáo DOCX** nếu muốn lưu danh sách lỗi ra file.
3. Bấm **Tự sửa định dạng** → chọn nơi lưu → app tạo **file mới** đã sửa.
   Bấm **Mở thư mục chứa file** để xem.

**Mẫu định dạng của trường / khách:** menu trái **Mẫu định dạng** → **Tạo mẫu từ file DOCX** → chọn
một file báo cáo mẫu đúng chuẩn. App tự học quy định từ file đó. Bấm **Đặt làm mặc định** để dùng mẫu
này cho các lần kiểm tra sau.

### Hoàn thiện câu chữ bằng AI (cần key)

1. Mở tài liệu → tab **Hoàn thiện** → chọn mẫu và **mức AI hiệu đính** → **Hoàn thiện báo cáo**.
2. Mở file kết quả bằng Word → tab **Xem lại** (Review). Chữ bị gạch ngang là chữ cũ, chữ gạch chân
   là chữ AI sửa.
3. Bấm **Chấp nhận** / **Từ chối** từng chỗ, hoặc **Chấp nhận ▼ → Chấp nhận Tất cả Thay đổi**.

AI chỉ sửa câu chữ, không thêm nội dung, không đổi số liệu.

### Phân tích AI và Thư viện prompt (cần key)

- Mở tài liệu → tab **Phân tích AI** → chọn **Nhận xét tổng quan**, **Chính tả & ngữ pháp** hoặc
  **Văn phong** → **Chạy phân tích**.
- Ô **Prompt của tôi**: chạy một yêu cầu đã lưu, ví dụ "Câu hỏi phản biện của hội đồng".
- Menu trái **Thư viện prompt**: thêm / sửa yêu cầu riêng của bạn. App tự gửi kèm nội dung báo cáo,
  không cần dán bài vào prompt.

### File kết quả nằm ở đâu?

Mặc định trong `Tài liệu\file báo cáo lưu trữ` (app tự tạo). Đổi trong **Cài đặt → Thư mục lưu file
kết quả**.

---

## Gặp lỗi?

| Lỗi                                         | Cách xử lý                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm` is not recognized                     | Chưa cài Node.js, hoặc cài xong chưa mở lại PowerShell. Cài Node.js rồi mở PowerShell mới.    |
| `Could not read package.json`               | PowerShell đang đứng sai thư mục. Mở lại đúng thư mục `NexusDesk-main` (thấy `package.json`). |
| Windows báo chặn file / "Smart App Control" | Chụp màn hình lỗi gửi người chia sẻ app. **Không tắt Smart App Control.**                     |
| AI báo hết lượt / quá tải                   | Đợi vài phút rồi thử lại, hoặc vào **Cài đặt** chọn model khác.                               |

## Cập nhật bản mới

Tải lại ZIP (Bước 2), giải nén **đè lên** thư mục cũ, chạy lại `npm install` rồi `npm run dev`.
Tài liệu, mẫu, prompt và key **không bị mất** (chúng nằm ở `%APPDATA%\Nexus Desk`, không nằm trong
thư mục app).

---

## Dành cho người phát triển

```powershell
git clone https://github.com/namtr-n/NexusDesk.git
cd NexusDesk
npm install
npm run dev      # chạy app
npm run check    # kiểm tra kiểu + lint + test
```

Mọi thay đổi vào `main` đi qua Pull Request. Kiến trúc: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
Lộ trình: [docs/KE-HOACH.md](docs/KE-HOACH.md)

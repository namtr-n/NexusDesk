# Nexus Desk

App desktop Windows giúp kiểm tra và hoàn thiện báo cáo Word (DOCX):

- **Kiểm tra định dạng** theo mẫu (font, cỡ chữ, giãn dòng, lề, tiêu đề, chú thích…) và xuất báo cáo lỗi.
- **Mẫu định dạng**: học từ file mẫu của trường / khách hàng, hoặc tự chỉnh tay.
- **Tự sửa định dạng** theo mẫu, lưu ra bản mới (file gốc giữ nguyên).
- **Hoàn thiện báo cáo**: sửa định dạng + AI (Gemini) sửa chính tả, văn phong. Mọi sửa đổi câu chữ
  được ghi bằng Track Changes để bạn Accept / Reject trong Word.
- **Phân tích AI**: nhận xét tổng quan, chính tả, văn phong.

Dữ liệu lưu trên máy bạn, không có tài khoản, không có server.

## Cài đặt (lần đầu)

1. Cài [Node.js](https://nodejs.org) bản LTS (bấm Next liên tục là được) và [Git](https://git-scm.com/download/win).
2. Mở PowerShell, chạy lần lượt:

   ```powershell
   git clone https://github.com/namtr-n/NexusDesk.git
   cd NexusDesk
   npm install
   npm run dev
   ```

3. App mở ra. Muốn dùng tính năng AI: vào **Cài đặt** → dán Gemini API key của **chính bạn**
   (lấy miễn phí tại [Google AI Studio](https://aistudio.google.com/apikey)). Key được mã hóa và chỉ
   lưu trên máy bạn. Không có key vẫn dùng được kiểm tra / tự sửa định dạng.

Những lần sau chỉ cần mở PowerShell trong thư mục `NexusDesk` và chạy `npm run dev`.

## Cập nhật bản mới

```powershell
git pull
npm install
npm run dev
```

## Cách dùng nhanh

1. **Tài liệu** → thêm file `.docx` báo cáo.
2. Tab **Kiểm tra định dạng** → chọn mẫu → xem lỗi → **Tự sửa định dạng** (lưu ra file mới).
3. Tab **Hoàn thiện** → chọn mức AI hiệu đính → mở file kết quả bằng Word → tab **Xem lại / Review**
   để chấp nhận hoặc từ chối từng sửa đổi.
4. File kết quả mặc định lưu ở `Tài liệu\file báo cáo lưu trữ` (đổi được trong **Cài đặt**).

## Lưu ý

- Windows bật **Smart App Control** có thể chặn một số thư viện khi `npm install`. Nếu app không
  chạy được, gửi ảnh lỗi cho người share repo.
- Dữ liệu app nằm ở `%APPDATA%\Nexus Desk`, không nằm trong thư mục code, nên `git pull` không làm
  mất dữ liệu.

## Dành cho người phát triển

```powershell
npm run check    # kiểm tra kiểu + lint + test
```

Kiến trúc: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Lộ trình: [docs/KE-HOACH.md](docs/KE-HOACH.md)

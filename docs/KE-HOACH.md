# Kế hoạch Nexus Desk 1.0

> **Chốt phạm vi (28/11/2026):** app dùng **cá nhân** cho báo cáo của chủ dự án. Bản hiện tại
> (GĐ0–4) đã đủ dùng. Không làm thêm tính năng mới; chỉ sửa lỗi / chỉnh nhỏ khi người dùng yêu cầu.

| GĐ  | Nội dung                                                     | Học được                                | Trạng thái |
| --- | ------------------------------------------------------------ | --------------------------------------- | ---------- |
| 0   | Cài Node.js, Git, tạo project                                | Terminal, Git, commit                   | ✅ Xong    |
| 1   | Khung app: cửa sổ, sidebar, dark mode, database, IPC an toàn | Duyệt kế hoạch của AI, cấu trúc project | ✅ Xong    |
| 2   | Kiểm tra định dạng báo cáo DOCX theo chuẩn, xuất báo cáo lỗi | Test, đọc diff, code review             | ✅ Xong    |
| 3   | Tích hợp Gemini: nhận xét nội dung, chính tả, văn phong      | API key, prompt, token, chi phí         | ✅ Xong    |
| 4   | Thư viện prompt (người dùng tự viết yêu cầu)                 | Viết yêu cầu cho AI                     | ✅ Xong    |
| 5   | Kho tài liệu + hỏi đáp RAG có trích nguồn                    | RAG, chống AI bịa                       | ❌ Bỏ      |
| 6   | Dashboard, đóng gói .exe                                     | Build, phát hành                        | ❌ Bỏ      |

## Đã thêm ngoài kế hoạch gốc

- Mẫu định dạng (học từ file mẫu của khách / trường), tự sửa định dạng, "Hoàn thiện báo cáo"
  (sửa định dạng + AI hiệu đính câu chữ bằng Track Changes).
- Chọn model AI: Tự động (dò model khỏe) hoặc Cố định.
- Thư mục lưu file kết quả mặc định + nút mở thư mục.

## Ý tưởng đã cân nhắc, KHÔNG làm (lưu lại để tham khảo nếu sau này đổi ý)

- Chốt 28/11/2026 (dùng cá nhân, bản hiện tại đủ dùng): GĐ5 kho tri thức + hỏi đáp; GĐ6 thống kê +
  file cài .exe; mục lục, danh mục hình / bảng, từ viết tắt, ngắt trang, đánh số trang; kiểm tra tài
  liệu tham khảo; sửa hàng loạt; tự cập nhật; kiểm tra trùng lặp nội bộ; CI, đánh số phiên bản.
- Chốt 27/11/2026: xoay vòng nhiều API key (rủi ro điều khoản Google); kiểm tra đạo văn / dò văn AI
  qua dịch vụ trả phí (Turnitin không có API cá nhân).

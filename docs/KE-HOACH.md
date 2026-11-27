# Kế hoạch Nexus Desk 1.0

| GĐ  | Nội dung                                                     | Học được                                | Trạng thái |
| --- | ------------------------------------------------------------ | --------------------------------------- | ---------- |
| 0   | Cài Node.js, Git, tạo project                                | Terminal, Git, commit                   | ✅ Xong    |
| 1   | Khung app: cửa sổ, sidebar, dark mode, database, IPC an toàn | Duyệt kế hoạch của AI, cấu trúc project | ✅ Xong    |
| 2   | Kiểm tra định dạng báo cáo DOCX theo chuẩn, xuất báo cáo lỗi | Test, đọc diff, code review             | ✅ Xong    |
| 3   | Tích hợp Gemini: nhận xét nội dung, chính tả, văn phong      | API key, prompt, token, chi phí         | ✅ Xong    |
| 4   | Thư viện prompt (người dùng tự viết yêu cầu)                 | Viết yêu cầu cho AI                     | ✅ Xong    |
| 5   | Kho tài liệu + hỏi đáp RAG có trích nguồn                    | RAG, chống AI bịa                       | ⏳         |
| 6   | Dashboard, đóng gói .exe                                     | Build, phát hành                        | ⏳         |

## Đã thêm ngoài kế hoạch gốc

- Mẫu định dạng (học từ file mẫu của khách / trường), tự sửa định dạng, "Hoàn thiện báo cáo"
  (sửa định dạng + AI hiệu đính câu chữ bằng Track Changes).
- Chọn model AI: Tự động (dò model khỏe) hoặc Cố định.
- Thư mục lưu file kết quả mặc định + nút mở thư mục.

## Định hướng phát triển sau (chưa làm, theo yêu cầu người dùng 27/11/2026)

- Tự chèn mục lục (TOC field của Word), danh mục hình / bảng (gắn style Caption + TOC theo chú thích).
- Danh mục từ viết tắt (tìm từ viết tắt, AI gợi ý nghĩa đầy đủ, người dùng duyệt lại).
- Ngắt trang trước mỗi chương, đánh số trang.
- Kiểm tra tài liệu tham khảo theo chuẩn (APA / IEEE). Sửa hàng loạt nhiều file. Tự cập nhật app.
  (Người dùng chốt 27/11/2026.)
- Kiểm tra trùng lặp nội bộ (làm sau GĐ5, dùng lại kho tài liệu + chỉ mục tìm kiếm): so báo cáo
  với các tài liệu đã nạp vào app, chỉ ra đoạn giống, tỉ lệ giống, giống với file nào. Chạy trên máy,
  miễn phí. Không so với Internet, không dò văn AI. (Người dùng chốt 27/11/2026.)

Đã cân nhắc và BỎ (27/11/2026): xoay vòng nhiều API key (rủi ro điều khoản Google; người dùng sẽ
trả phí cho một key), kiểm tra đạo văn / dò văn AI qua dịch vụ trả phí (Turnitin không có API cá nhân).

Quy trình mỗi giai đoạn: yêu cầu → kế hoạch ngắn → duyệt → làm → giải thích → tự kiểm tra → commit.

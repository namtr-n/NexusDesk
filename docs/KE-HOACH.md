# Kế hoạch Nexus Desk 1.0

| GĐ  | Nội dung                                                     | Học được                                | Trạng thái          |
| --- | ------------------------------------------------------------ | --------------------------------------- | ------------------- |
| 0   | Cài Node.js, Git, tạo project                                | Terminal, Git, commit                   | ✅ Xong             |
| 1   | Khung app: cửa sổ, sidebar, dark mode, database, IPC an toàn | Duyệt kế hoạch của AI, cấu trúc project | ✅ Xong             |
| 2   | Kiểm tra định dạng báo cáo DOCX theo chuẩn, xuất báo cáo lỗi | Test, đọc diff, code review             | ✅ Xong             |
| 3   | Tích hợp Gemini: nhận xét nội dung, chính tả, văn phong      | API key, prompt, token, chi phí         | 🧪 Chờ thử key thật |
| 4   | Thư viện prompt (người dùng tự viết yêu cầu)                 | Viết yêu cầu cho AI                     | ⏳                  |
| 5   | Kho tài liệu + hỏi đáp RAG có trích nguồn                    | RAG, chống AI bịa                       | ⏳                  |
| 6   | Dashboard, đóng gói .exe                                     | Build, phát hành                        | ⏳                  |

## Đã thêm ngoài kế hoạch gốc

- Mẫu định dạng (học từ file mẫu của khách / trường), tự sửa định dạng, "Hoàn thiện báo cáo"
  (sửa định dạng + AI hiệu đính câu chữ bằng Track Changes).

## Định hướng phát triển sau (chưa làm, theo yêu cầu người dùng 27/11/2026)

- Tự chèn mục lục (TOC field của Word), danh mục hình / bảng (gắn style Caption + TOC theo chú thích).
- Danh mục từ viết tắt (tìm từ viết tắt, AI gợi ý nghĩa đầy đủ, người dùng duyệt lại).
- Ngắt trang trước mỗi chương, đánh số trang.

Quy trình mỗi giai đoạn: yêu cầu → kế hoạch ngắn → duyệt → làm → giải thích → tự kiểm tra → commit.

/**
 * Vài prompt mẫu thêm vào thư viện ở lần chạy đầu tiên (chỉ một lần; người dùng xóa thì
 * không tự thêm lại). Mỗi prompt được gửi cho AI kèm toàn văn tài liệu đang chọn.
 */
import type { PromptFields } from '@shared/prompts'

export const STARTER_PROMPTS: PromptFields[] = [
  {
    title: 'Câu hỏi phản biện của hội đồng',
    category: 'Bảo vệ đồ án',
    tags: ['bảo vệ', 'phản biện'],
    projectId: null,
    content: `Hãy đóng vai hội đồng chấm đồ án / báo cáo.
Dựa trên tài liệu, đặt 10 câu hỏi phản biện mà hội đồng nhiều khả năng sẽ hỏi, ưu tiên những chỗ lập luận còn yếu, số liệu thiếu nguồn hoặc lựa chọn phương pháp chưa được giải thích.
Với mỗi câu hỏi, trình bày:
- **Câu hỏi:** ...
- **Vì sao hội đồng hỏi:** chỉ ra đoạn / mục liên quan trong tài liệu.
- **Gợi ý trả lời:** 2–4 câu, chỉ dựa trên nội dung tài liệu; nếu tài liệu không đủ thông tin thì nói rõ cần bổ sung gì.`
  },
  {
    title: 'Soạn dàn ý slide thuyết trình',
    category: 'Bảo vệ đồ án',
    tags: ['slide', 'thuyết trình'],
    projectId: null,
    content: `Soạn dàn ý cho bài thuyết trình khoảng 10–12 slide (10–15 phút) từ tài liệu.
Với mỗi slide, ghi:
## Slide N: Tiêu đề
- 3–5 ý chính, mỗi ý tối đa 12 từ
- **Lời nói gợi ý:** 2–3 câu người trình bày nên nói
Slide cuối là kết luận và hướng phát triển. Không thêm nội dung không có trong tài liệu.`
  },
  {
    title: 'Viết tóm tắt (abstract) khoảng 200 từ',
    category: 'Viết báo cáo',
    tags: ['tóm tắt', 'abstract'],
    projectId: null,
    content: `Viết đoạn tóm tắt (abstract) khoảng 200 từ cho tài liệu, văn phong học thuật, gồm: bối cảnh và vấn đề, mục tiêu, phương pháp, kết quả chính, ý nghĩa.
Viết thành một đoạn liền mạch. Sau đó đề xuất 4–6 từ khóa (keywords).
Chỉ dùng thông tin có trong tài liệu; chỗ nào tài liệu chưa nêu (ví dụ chưa có số liệu kết quả) thì ghi rõ ở cuối.`
  },
  {
    title: 'Rà soát tài liệu tham khảo và trích dẫn',
    category: 'Kiểm tra',
    tags: ['trích dẫn', 'tài liệu tham khảo'],
    projectId: null,
    content: `Rà soát phần trích dẫn và danh mục tài liệu tham khảo của tài liệu:
## Trích dẫn trong bài
Liệt kê những đoạn nêu số liệu, định nghĩa hoặc nhận định quan trọng nhưng KHÔNG có trích dẫn nguồn (trích nguyên văn ngắn).
## Danh mục tài liệu tham khảo
- Tài liệu được trích trong bài nhưng không có trong danh mục, và ngược lại (nếu nhận ra được).
- Mục ghi thiếu thông tin (tác giả, năm, tên, nơi xuất bản, đường dẫn) hoặc không thống nhất một kiểu trình bày.
## Gợi ý
3–5 việc nên sửa trước. Không tự bịa nguồn tài liệu.`
  }
]

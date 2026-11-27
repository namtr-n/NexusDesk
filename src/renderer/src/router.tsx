import { createHashRouter } from 'react-router'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { ComingSoonPage } from '@renderer/pages/ComingSoonPage'
import { DashboardPage } from '@renderer/pages/Dashboard/DashboardPage'
import { SettingsPage } from '@renderer/pages/Settings/SettingsPage'

// Hash router (#/documents...) vì app chạy từ file trên máy, không có web server.
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'documents',
        element: (
          <ComingSoonPage
            title="Tài liệu"
            description="Kiểm tra định dạng báo cáo DOCX và phân tích nội dung."
            phase={2}
            features={[
              'Mở file DOCX, PDF, TXT (file gốc luôn được giữ nguyên)',
              'Kiểm tra font, cỡ chữ, lề, giãn dòng, heading theo chuẩn báo cáo',
              'Xuất báo cáo lỗi',
              'AI nhận xét nội dung, chính tả, văn phong (Giai đoạn 3)'
            ]}
          />
        )
      },
      {
        path: 'knowledge',
        element: (
          <ComingSoonPage
            title="Kho tri thức"
            description="Thư viện tài liệu để tìm kiếm và hỏi đáp."
            phase={5}
            features={[
              'Thêm giáo trình, slide, tài liệu vào thư viện',
              'Tìm kiếm toàn văn',
              'Hỏi đáp trên tài liệu, có trích dẫn nguồn'
            ]}
          />
        )
      },
      {
        path: 'prompts',
        element: (
          <ComingSoonPage
            title="Prompt"
            description="Thư viện prompt cá nhân."
            phase={4}
            features={[
              'Lưu, sửa, xóa prompt',
              'Phân loại, tìm kiếm',
              'Sao chép một chạm, lịch sử phiên bản'
            ]}
          />
        )
      },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])

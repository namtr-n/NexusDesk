import { createHashRouter } from 'react-router'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { ComingSoonPage } from '@renderer/pages/ComingSoonPage'
import { DashboardPage } from '@renderer/pages/Dashboard/DashboardPage'
import { DocumentsPage } from '@renderer/pages/Documents/DocumentsPage'
import { SettingsPage } from '@renderer/pages/Settings/SettingsPage'

// Hash router (#/documents...) vì app chạy từ file trên máy, không có web server.
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'documents', element: <DocumentsPage /> },
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

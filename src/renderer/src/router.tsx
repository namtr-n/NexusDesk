import { createHashRouter } from 'react-router'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { ComingSoonPage } from '@renderer/pages/ComingSoonPage'
import { DashboardPage } from '@renderer/pages/Dashboard/DashboardPage'
import { DocumentsPage } from '@renderer/pages/Documents/DocumentsPage'
import { PromptsPage } from '@renderer/pages/Prompts/PromptsPage'
import { SettingsPage } from '@renderer/pages/Settings/SettingsPage'
import { TemplatesPage } from '@renderer/pages/Templates/TemplatesPage'

// Hash router (#/documents...) vì app chạy từ file trên máy, không có web server.
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'templates', element: <TemplatesPage /> },
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
      { path: 'prompts', element: <PromptsPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])

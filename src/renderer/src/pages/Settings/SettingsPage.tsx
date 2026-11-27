import { ErrorBanner, Loading, PageHeader, Panel } from '@renderer/components/ui'
import { SettingsIcon } from '@renderer/components/icons'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { unwrap } from '@renderer/lib/api'
import { AiSettingsPanel } from './AiSettingsPanel'
import { OutputDirPanel } from './OutputDirPanel'

const loadInfo = () => unwrap(window.nexus.app.getInfo())

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 py-2">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="break-all font-mono text-[12px] select-text">{value}</dd>
    </div>
  )
}

export function SettingsPage() {
  const info = useAsyncData(loadInfo)

  return (
    <>
      <PageHeader
        title="Cài đặt"
        subtitle="Gemini AI, thông tin ứng dụng và nơi lưu dữ liệu. Quy định trình bày nằm ở trang Mẫu định dạng."
      />
      <div className="space-y-5">
        <AiSettingsPanel />
        <OutputDirPanel />
        <Panel title="Ứng dụng" icon={<SettingsIcon />}>
          {info.status === 'loading' && <Loading />}
          {info.status === 'error' && <ErrorBanner message={info.error} />}
          {info.status === 'ready' && (
            <dl className="divide-y divide-border">
              <Row label="Phiên bản" value={info.data.version} />
              <Row label="Thư mục dữ liệu" value={info.data.dataPath} />
              <Row label="Database" value={info.data.databasePath} />
              <Row label="File nhật ký" value={info.data.logPath} />
            </dl>
          )}
        </Panel>
      </div>
    </>
  )
}

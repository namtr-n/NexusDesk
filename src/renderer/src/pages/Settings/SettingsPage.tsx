import { ErrorBanner, Loading, PageHeader, Panel } from '@renderer/components/ui'
import { SettingsIcon } from '@renderer/components/icons'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { unwrap } from '@renderer/lib/api'
import { FormatRulesPanel } from './FormatRulesPanel'

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
        subtitle="Quy tắc định dạng, thông tin ứng dụng và nơi lưu dữ liệu."
      />
      <div className="space-y-5">
        <FormatRulesPanel />
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
        <Panel title="Gemini API key">
          <p className="text-[13px] text-muted">
            Sẽ có ở Giai đoạn 3. Key sẽ được mã hóa bằng cơ chế bảo mật của Windows và không bao giờ
            hiện lại trên giao diện.
          </p>
        </Panel>
      </div>
    </>
  )
}

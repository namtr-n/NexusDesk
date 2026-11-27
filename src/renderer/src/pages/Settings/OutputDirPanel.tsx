import { useEffect, useState } from 'react'
import type { OutputDirInfo } from '@shared/ipc-contract'
import { FolderIcon } from '@renderer/components/icons'
import { Button, ErrorBanner, Loading, Panel } from '@renderer/components/ui'
import { errorMessage, unwrap } from '@renderer/lib/api'

/** Cài đặt thư mục lưu file kết quả (bản đã sửa, bản hoàn thiện, báo cáo lỗi) */
export function OutputDirPanel() {
  const [info, setInfo] = useState<OutputDirInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    unwrap(window.nexus.app.getOutputDir())
      .then((i) => active && setInfo(i))
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [])

  async function run(action: () => Promise<OutputDirInfo | void>) {
    setBusy(true)
    setError(null)
    try {
      const r = await action()
      if (r) setInfo(r)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Thư mục lưu file kết quả" icon={<FolderIcon />}>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      {!info ? (
        !error && <Loading />
      ) : (
        <div className="space-y-3 text-[13px]">
          <p className="text-[12px] text-muted">
            Bản đã sửa định dạng, bản hoàn thiện và báo cáo lỗi được lưu ở đây: hộp thoại &quot;Lưu
            thành&quot; luôn mở sẵn thư mục này (vẫn đổi được từng lần nếu muốn). File gốc của bạn
            (ví dụ trong Downloads) không bị đụng tới.
          </p>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[12px] select-text">
              {info.path}
            </span>
            {info.isDefault && (
              <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                MẶC ĐỊNH
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => run(() => unwrap(window.nexus.app.openOutputDir()))}
              disabled={busy}
            >
              Mở thư mục
            </Button>
            <Button
              onClick={() => run(() => unwrap(window.nexus.app.chooseOutputDir()))}
              disabled={busy}
            >
              Đổi thư mục…
            </Button>
            {!info.isDefault && (
              <Button
                variant="ghost"
                onClick={() => run(() => unwrap(window.nexus.app.resetOutputDir()))}
                disabled={busy}
              >
                Về mặc định
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

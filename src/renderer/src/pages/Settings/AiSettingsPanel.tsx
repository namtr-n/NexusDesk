import { useEffect, useState } from 'react'
import type { AiModelOption, AiStatus } from '@shared/ai'
import { Button, ErrorBanner, InfoBanner, Loading, Panel, Select } from '@renderer/components/ui'
import { errorMessage, unwrap } from '@renderer/lib/api'

const AUTO = '__auto__'

export function AiSettingsPanel() {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [models, setModels] = useState<AiModelOption[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    unwrap(window.nexus.ai.getStatus())
      .then((s) => active && setStatus(s))
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [])

  async function run<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      return await action()
    } catch (err) {
      setError(errorMessage(err))
      return undefined
    } finally {
      setBusy(null)
    }
  }

  async function saveKey() {
    const s = await run('save', () => unwrap(window.nexus.ai.setKey({ apiKey: keyInput })))
    if (s) {
      setStatus(s)
      setKeyInput('') // không giữ key trên giao diện
      setNotice('Đã lưu API key (đã mã hóa). Bấm "Kiểm tra kết nối" để thử.')
      setModels(null)
    }
  }

  async function removeKey() {
    if (!window.confirm('Xóa Gemini API key khỏi máy này?')) return
    const s = await run('remove', () => unwrap(window.nexus.ai.removeKey()))
    if (s) {
      setStatus(s)
      setModels(null)
      setNotice('Đã xóa API key.')
    }
  }

  async function loadModels() {
    const list = await run('models', () => unwrap(window.nexus.ai.listModels()))
    if (list) setModels(list)
  }

  async function changeModel(value: string) {
    const s = await run('model', () =>
      unwrap(window.nexus.ai.setModel({ model: value === AUTO ? null : value }))
    )
    if (s) setStatus(s)
  }

  async function test() {
    const r = await run('test', () => unwrap(window.nexus.ai.test()))
    if (r) {
      setNotice(`Kết nối thành công với ${r.model} (${(r.latencyMs / 1000).toFixed(1)} giây).`)
      setStatus(await unwrap(window.nexus.ai.getStatus()))
    }
  }

  return (
    <Panel title="Gemini AI">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      {notice && <InfoBanner onClose={() => setNotice(null)}>{notice}</InfoBanner>}
      {!status ? (
        !error && <Loading />
      ) : (
        <div className="space-y-4 text-[13px]">
          <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-4">
            <span>Trạng thái</span>
            <span className={status.hasKey ? 'text-success' : 'text-amber-300'}>
              {status.hasKey ? '● Đã có API key (đã mã hóa trên máy này)' : '● Chưa có API key'}
            </span>
          </div>

          <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-4">
            <span className="pt-1.5">{status.hasKey ? 'Thay API key' : 'Nhập API key'}</span>
            <div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveKey()
                }}
              >
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Dán Gemini API key vào đây"
                  className="h-8 w-full max-w-md rounded-md border border-border bg-bg px-2.5 font-mono text-[12px] text-text placeholder:font-sans placeholder:text-muted/70 focus:border-accent focus:outline-none"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy !== null || !keyInput.trim()}
                >
                  Lưu key
                </Button>
                {status.hasKey && (
                  <Button variant="danger" onClick={removeKey} disabled={busy !== null}>
                    Xóa key
                  </Button>
                )}
              </form>
              <p className="mt-1.5 text-[12px] text-muted">
                Lấy key miễn phí tại{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Google AI Studio
                </a>
                . Key được mã hóa bằng cơ chế bảo mật của Windows, không hiện lại trên giao diện.
                Đừng gửi key cho ai, kể cả dán vào chat.
              </p>
              {!status.encryptionAvailable && (
                <p className="mt-1 text-[12px] text-danger">
                  Máy này không hỗ trợ lưu trữ bảo mật nên không thể lưu key.
                </p>
              )}
            </div>
          </div>

          {status.hasKey && (
            <>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-4">
                <span>Model</span>
                <div className="flex items-center gap-2">
                  {models ? (
                    <Select
                      value={status.model ?? AUTO}
                      onChange={(e) => void changeModel(e.target.value)}
                      disabled={busy !== null}
                      className="w-72"
                    >
                      <option value={AUTO}>Tự động (bản Flash mới nhất)</option>
                      {status.model && !models.some((m) => m.id === status.model) && (
                        <option value={status.model}>{status.model}</option>
                      )}
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <>
                      {status.model ? (
                        <span className="font-mono text-[12px]">{status.model}</span>
                      ) : (
                        <span className="text-muted">Tự động (bản Flash mới nhất)</span>
                      )}
                      <Button onClick={loadModels} disabled={busy !== null}>
                        {busy === 'models' ? 'Đang tải…' : 'Đổi model'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-4">
                <span>Kết nối</span>
                <div>
                  <Button onClick={test} disabled={busy !== null}>
                    {busy === 'test' ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

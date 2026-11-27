import { useState, type FormEvent } from 'react'
import { projectCreateSchema, type Project } from '@shared/ipc-contract'
import { FolderIcon } from '@renderer/components/icons'
import { Button, EmptyState, ErrorBanner, Loading, Panel, TextInput } from '@renderer/components/ui'
import type { AsyncState } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatDateTime } from '@renderer/lib/format'

interface Props {
  state: AsyncState<Project[]>
  /** Gọi sau mỗi thay đổi để tải lại danh sách và nhật ký */
  onChanged: () => void
}

/** Kiểm tra form ngay trên giao diện bằng đúng schema mà main process dùng. */
function validate(name: string, description: string): string | null {
  const parsed = projectCreateSchema.safeParse({ name, description })
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
}

export function ProjectsPanel({ state, onChanged }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const invalid = validate(name, description)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      await unwrap(window.nexus.projects.create({ name, description }))
      setName('')
      setDescription('')
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Dự án" icon={<FolderIcon />}>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <TextInput
          placeholder="Tên dự án, ví dụ: Đồ án tốt nghiệp"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          className="max-w-64"
        />
        <TextInput
          placeholder="Mô tả ngắn (không bắt buộc)"
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          Thêm
        </Button>
      </form>

      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <ErrorBanner message={state.error} />}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <EmptyState
            title="Chưa có dự án nào"
            hint="Tạo dự án để gom tài liệu và prompt theo từng môn học hoặc đồ án."
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {state.data.map((p) => (
              <ProjectRow key={p.id} project={p} onChanged={onChanged} onError={setError} />
            ))}
          </ul>
        ))}
    </Panel>
  )
}

function ProjectRow({
  project,
  onChanged,
  onError
}: {
  project: Project
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      onChanged()
      return true
    } catch (err) {
      onError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const invalid = validate(name, description)
    if (invalid) return onError(invalid)
    const ok = await run(() =>
      unwrap(window.nexus.projects.update({ id: project.id, name, description }))
    )
    if (ok) setEditing(false)
  }

  function cancel() {
    setName(project.name)
    setDescription(project.description)
    setEditing(false)
  }

  async function remove() {
    if (!window.confirm(`Xóa dự án "${project.name}"? Thao tác này không hoàn tác được.`)) return
    await run(() => unwrap(window.nexus.projects.remove({ id: project.id })))
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 bg-surface-2/40 px-3 py-2">
        <TextInput
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          className="max-w-64"
          autoFocus
        />
        <TextInput
          value={description}
          maxLength={500}
          placeholder="Mô tả"
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
          Lưu
        </Button>
        <Button variant="ghost" onClick={cancel} disabled={busy}>
          Hủy
        </Button>
      </li>
    )
  }

  return (
    <li className="group flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{project.name}</p>
        <p className="truncate text-[12px] text-muted">
          {project.description || 'Không có mô tả'} · Cập nhật {formatDateTime(project.updatedAt)}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
          Sửa
        </Button>
        <Button variant="danger" onClick={remove} disabled={busy}>
          Xóa
        </Button>
      </div>
    </li>
  )
}

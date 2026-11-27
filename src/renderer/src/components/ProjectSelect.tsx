import type { Project } from '@shared/ipc-contract'
import type { ProjectFilter } from '@renderer/lib/project-filter'
import { Select } from './ui'

export function ProjectSelect({
  projects,
  value,
  onChange,
  includeAll,
  disabled
}: {
  projects: Project[]
  value: ProjectFilter
  onChange: (v: ProjectFilter) => void
  includeAll?: boolean
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ProjectFilter)}
      className="max-w-56"
    >
      {includeAll && <option value="all">Tất cả dự án</option>}
      <option value="none">{includeAll ? 'Chưa gắn dự án' : '— Không gắn dự án —'}</option>
      {projects.map((p) => (
        <option key={p.id} value={String(p.id)}>
          {p.name}
        </option>
      ))}
    </Select>
  )
}

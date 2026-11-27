import { useState } from 'react'
import { PageHeader } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { unwrap } from '@renderer/lib/api'
import { ActivityPanel } from './ActivityPanel'
import { ProjectsPanel } from './ProjectsPanel'

// Khai báo ngoài component để hàm luôn cố định (useAsyncData yêu cầu).
const loadProjects = () => unwrap(window.nexus.projects.list())
const loadActivity = () => unwrap(window.nexus.activity.listRecent({ limit: 15 }))

export function DashboardPage() {
  const [version, setVersion] = useState(0)
  const projects = useAsyncData(loadProjects, version)
  const activity = useAsyncData(loadActivity, version)
  const refresh = () => setVersion((v) => v + 1)

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Dự án của bạn và những việc vừa làm." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ProjectsPanel state={projects} onChanged={refresh} />
        <ActivityPanel state={activity} />
      </div>
    </>
  )
}

import { NavLink } from 'react-router'
import {
  DocumentIcon,
  HomeIcon,
  LibraryIcon,
  PromptIcon,
  SettingsIcon,
  TemplateIcon
} from '@renderer/components/icons'

const mainItems = [
  { to: '/', label: 'Tổng quan', icon: HomeIcon },
  { to: '/documents', label: 'Tài liệu', icon: DocumentIcon },
  { to: '/templates', label: 'Mẫu định dạng', icon: TemplateIcon },
  { to: '/knowledge', label: 'Kho tri thức', icon: LibraryIcon },
  { to: '/prompts', label: 'Thư viện prompt', icon: PromptIcon }
]

function Item({ to, label, icon: Icon }: { to: string; label: string; icon: typeof HomeIcon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${
          isActive
            ? 'bg-surface-2 font-medium text-text'
            : 'text-muted hover:bg-surface-2/60 hover:text-text'
        }`
      }
    >
      <Icon />
      {label}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="grid size-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-white">
          N
        </div>
        <span className="text-[14px] font-semibold tracking-tight">Nexus Desk</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {mainItems.map((item) => (
          <Item key={item.to} {...item} />
        ))}
      </nav>

      <div className="border-t border-border px-2 py-2">
        <Item to="/settings" label="Cài đặt" icon={SettingsIcon} />
      </div>
    </aside>
  )
}

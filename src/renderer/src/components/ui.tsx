// Các thành phần giao diện dùng chung, để mọi trang có cùng phong cách.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'bg-surface-2 text-text border border-border hover:border-muted/50',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'text-danger hover:bg-danger/10'
}

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-8 w-full rounded-md border border-border bg-bg px-2.5 text-[13px] text-text placeholder:text-muted/70 focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  )
}

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Select({
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-8 rounded-md border border-border bg-bg px-2 text-[13px] text-text focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  )
}

export function InfoBanner({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-[13px] text-text">
      <div>{children}</div>
      {onClose && (
        <button type="button" className="shrink-0 text-muted hover:text-text" onClick={onClose}>
          Đóng
        </button>
      )}
    </div>
  )
}

export function Panel({
  title,
  icon,
  actions,
  children
}: {
  title: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text">
          <span className="text-muted">{icon}</span>
          {title}
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-[13px] font-medium text-text">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[12px] text-muted">{hint}</p>}
    </div>
  )
}

export function ErrorBanner({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-start justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
    >
      <span>{message}</span>
      {onClose && (
        <button type="button" className="shrink-0 opacity-70 hover:opacity-100" onClick={onClose}>
          Đóng
        </button>
      )}
    </div>
  )
}

export function Loading() {
  return <p className="py-6 text-center text-[13px] text-muted">Đang tải…</p>
}

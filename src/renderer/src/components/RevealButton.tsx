import { useState } from 'react'
import { errorMessage, unwrap } from '@renderer/lib/api'

/** Nút mở File Explorer, chọn sẵn file app vừa lưu */
export function RevealButton({ path }: { path: string }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          unwrap(window.nexus.app.revealFile({ path })).catch((err: unknown) =>
            setError(errorMessage(err))
          )
        }
        className="text-[12px] text-accent hover:underline"
      >
        Mở thư mục chứa file
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  )
}

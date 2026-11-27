import { useEffect, useState } from 'react'
import { errorMessage } from '@renderer/lib/api'

export type AsyncState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: string }

/**
 * Tải dữ liệu bất đồng bộ và theo dõi trạng thái loading / ready / error.
 * Đổi `reloadKey` để tải lại (ví dụ sau khi thêm/xóa dự án).
 * `load` phải là hàm cố định (khai báo ngoài component hoặc dùng useCallback).
 */
export function useAsyncData<T>(load: () => Promise<T>, reloadKey: unknown = 0): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })

  useEffect(() => {
    let active = true
    load()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch((err: unknown) => active && setState({ status: 'error', error: errorMessage(err) }))
    return () => {
      active = false
    }
  }, [load, reloadKey])

  return state
}

import type { Result } from '@shared/ipc-contract'

/**
 * Mở "phong bì" Result: thành công thì trả data, thất bại thì ném lỗi
 * với thông báo tiếng Việt từ main process để giao diện hiển thị.
 */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error)
  return result.data
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

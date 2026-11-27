/**
 * Thư mục lưu FILE KẾT QUẢ (bản đã sửa, bản hoàn thiện, báo cáo lỗi).
 * File đầu vào của người dùng (Downloads...) không bao giờ bị đụng tới.
 */
import { existsSync, mkdirSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import { UserError } from '../../errors'
import type { SettingsStore } from './settings-store'

const KEY = 'output.dir'
export const DEFAULT_OUTPUT_FOLDER_NAME = 'file báo cáo lưu trữ'

export interface OutputDirService {
  /** Thư mục đang dùng (đã tạo nếu chưa có) */
  get(): string
  /** true nếu người dùng chưa đổi (đang dùng mặc định) */
  isDefault(): boolean
  set(dir: string): string
  reset(): string
  /** Ghi nhận file app vừa lưu (chỉ những file này mới được "mở thư mục chứa") */
  remember(path: string): void
  isKnownOutput(path: string): boolean
}

export function createOutputDirService(
  settings: SettingsStore,
  documentsDir: string
): OutputDirService {
  const known = new Set<string>()
  const defaultDir = join(documentsDir, DEFAULT_OUTPUT_FOLDER_NAME)
  const norm = (p: string): string => resolve(p).toLowerCase()

  function ensure(dir: string): string {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      throw new UserError(`Không tạo được thư mục lưu kết quả: ${dir}`)
    }
    return dir
  }

  return {
    get() {
      const saved = settings.get(KEY)
      // Thư mục đã chọn bị xóa / ổ đĩa rút ra → tạo lại nếu được, không thì dùng mặc định
      if (saved) {
        try {
          return ensure(saved)
        } catch {
          return ensure(defaultDir)
        }
      }
      return ensure(defaultDir)
    },
    isDefault() {
      return !settings.get(KEY)
    },
    set(dir) {
      if (!isAbsolute(dir)) throw new UserError('Đường dẫn thư mục không hợp lệ.')
      ensure(dir)
      settings.set(KEY, dir)
      return dir
    },
    reset() {
      settings.remove(KEY)
      return ensure(defaultDir)
    },
    remember(path) {
      known.add(norm(path))
    },
    isKnownOutput(path) {
      return known.has(norm(path)) && existsSync(path)
    }
  }
}

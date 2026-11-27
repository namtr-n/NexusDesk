/**
 * Lưu Gemini API key ĐÃ MÃ HÓA bằng cơ chế bảo mật của hệ điều hành
 * (Electron safeStorage → Windows DPAPI: chỉ đúng tài khoản Windows này giải mã được).
 * Key không bao giờ được ghi log hay gửi sang giao diện.
 */
import { UserError } from '../../errors'
import type { SettingsStore } from '../settings/settings-store'

const KEY = 'ai.apiKey'

export interface Encryptor {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export interface KeyStore {
  hasKey(): boolean
  /** Trả key đã giải mã — CHỈ dùng trong main process để gọi Gemini */
  getKey(): string | null
  setKey(key: string): void
  removeKey(): void
}

export function createKeyStore(settings: SettingsStore, encryptor: Encryptor): KeyStore {
  return {
    hasKey() {
      return settings.get(KEY) !== undefined
    },
    getKey() {
      const stored = settings.get(KEY)
      if (!stored) return null
      try {
        return encryptor.decrypt(Buffer.from(stored, 'base64'))
      } catch {
        // Ví dụ: database chép sang máy / tài khoản Windows khác → không giải mã được
        throw new UserError('Không giải mã được API key đã lưu. Hãy xóa key và nhập lại.')
      }
    },
    setKey(key) {
      if (!encryptor.isAvailable()) {
        throw new UserError('Máy này không hỗ trợ lưu trữ bảo mật, không thể lưu API key an toàn.')
      }
      settings.set(KEY, encryptor.encrypt(key).toString('base64'))
    },
    removeKey() {
      settings.remove(KEY)
    }
  }
}

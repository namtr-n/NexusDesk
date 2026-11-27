import { existsSync } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../../src/main/db/client'
import { UserError } from '../../src/main/errors'
import {
  createOutputDirService,
  DEFAULT_OUTPUT_FOLDER_NAME,
  type OutputDirService
} from '../../src/main/services/settings/output-dir'
import { createSettingsStore } from '../../src/main/services/settings/settings-store'
import { createTestDatabase } from './test-db'

describe('OutputDirService', () => {
  let database: DatabaseHandle
  let docsDir: string
  let out: OutputDirService

  beforeEach(async () => {
    database = createTestDatabase()
    docsDir = await mkdtemp(join(tmpdir(), 'nexus-out-'))
    out = createOutputDirService(createSettingsStore(database.db), docsDir)
  })

  afterEach(async () => {
    database.close()
    await rm(docsDir, { recursive: true, force: true })
  })

  it('mặc định: Tài liệu\\file báo cáo lưu trữ, tự tạo nếu chưa có', () => {
    const dir = out.get()
    expect(dir).toBe(join(docsDir, DEFAULT_OUTPUT_FOLDER_NAME))
    expect(existsSync(dir)).toBe(true)
    expect(out.isDefault()).toBe(true)
  })

  it('đổi thư mục, nhớ lại, về mặc định', () => {
    const custom = join(docsDir, 'khach A')
    out.set(custom)
    expect(out.get()).toBe(custom)
    expect(out.isDefault()).toBe(false)
    expect(out.reset()).toBe(join(docsDir, DEFAULT_OUTPUT_FOLDER_NAME))
    expect(out.isDefault()).toBe(true)
    expect(() => out.set('thu-muc-tuong-doi')).toThrow(UserError)
  })

  it('chỉ "mở thư mục chứa" được file app đã lưu', async () => {
    const file = join(out.get(), 'a.docx')
    expect(out.isKnownOutput(file)).toBe(false)
    out.remember(file)
    expect(out.isKnownOutput(file)).toBe(false) // chưa có file thật
    await writeFile(file, 'x')
    expect(out.isKnownOutput(file.toUpperCase())).toBe(true)
    expect(out.isKnownOutput(join(docsDir, 'khac.docx'))).toBe(false)
  })
})

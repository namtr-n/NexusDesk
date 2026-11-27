import { resolve } from 'path'
import { openDatabase, type DatabaseHandle } from '../../src/main/db/client'

/** Database tạm trong bộ nhớ, chạy đủ migration thật. Mỗi test một database riêng. */
export function createTestDatabase(): DatabaseHandle {
  return openDatabase(':memory:', resolve(__dirname, '../../drizzle'))
}

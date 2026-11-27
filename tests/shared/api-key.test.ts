import { describe, expect, it } from 'vitest'
import { apiKeySchema, cleanApiKey } from '@shared/ai'

const KEY = 'AIzaSyD-abc_DEF123456789012345678901234'

describe('API key', () => {
  it('chấp nhận key kiểu cũ và định dạng khác (có dấu chấm...)', () => {
    expect(apiKeySchema.parse(KEY)).toBe(KEY)
    const other = 'AQ.Ab8RN6Lx-q1Zz2Yy3Xx4Ww5Vv6Uu7Tt8Ss9Rr0Qq1Pp'
    expect(apiKeySchema.parse(other)).toBe(other)
  })

  it('tự làm sạch thứ dính thêm khi copy', () => {
    expect(cleanApiKey(`  ${KEY}\r\n`)).toBe(KEY)
    expect(cleanApiKey(`"${KEY}"`)).toBe(KEY)
    expect(cleanApiKey(`GEMINI_API_KEY=${KEY}`)).toBe(KEY)
    expect(cleanApiKey(`export GOOGLE_API_KEY="${KEY}";`)).toBe(KEY)
    expect(cleanApiKey(`Bearer ${KEY}`)).toBe(KEY)
    expect(cleanApiKey(`AIzaSyD-abc_DEF12345\n6789012345678901234`)).toBe(KEY)
  })

  it('từ chối key quá ngắn hoặc có ký tự tiếng Việt', () => {
    expect(apiKeySchema.safeParse('abc').success).toBe(false)
    expect(apiKeySchema.safeParse('khóa-của-tôi-dài-hơn-hai-mươi-ký-tự').success).toBe(false)
  })
})

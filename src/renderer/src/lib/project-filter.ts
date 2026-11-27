/** Giá trị bộ lọc dự án: 'all' = tất cả, 'none' = chưa gắn dự án, hoặc id dự án dạng chuỗi */
export type ProjectFilter = 'all' | 'none' | `${number}`

export function filterToProjectId(f: ProjectFilter): number | null | undefined {
  if (f === 'all') return undefined
  if (f === 'none') return null
  return Number(f)
}

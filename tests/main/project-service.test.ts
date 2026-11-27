import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectCreateSchema, projectUpdateSchema } from '@shared/ipc-contract'
import type { DatabaseHandle } from '../../src/main/db/client'
import { UserError } from '../../src/main/errors'
import {
  createActivityRepository,
  type ActivityRepository
} from '../../src/main/services/activity/activity-repository'
import {
  createProjectService,
  type ProjectService
} from '../../src/main/services/projects/project-service'
import { createTestDatabase } from './test-db'

describe('ProjectService', () => {
  let database: DatabaseHandle
  let activity: ActivityRepository
  let projects: ProjectService

  beforeEach(() => {
    database = createTestDatabase()
    activity = createActivityRepository(database.db)
    projects = createProjectService(database.db, activity)
  })

  afterEach(() => database.close())

  const create = (name: string, description?: string) =>
    projects.create(projectCreateSchema.parse({ name, description }))

  it('tạo dự án và đọc lại được', () => {
    const created = create('  Đồ án tốt nghiệp  ', 'Báo cáo cuối khóa')
    expect(created.id).toBeGreaterThan(0)
    expect(created.name).toBe('Đồ án tốt nghiệp') // đã bỏ khoảng trắng thừa
    expect(projects.list()).toEqual([created])
  })

  it('mô tả để trống thì lưu chuỗi rỗng', () => {
    expect(create('Môn Java').description).toBe('')
  })

  it('cập nhật tên và mô tả', () => {
    const p = create('Tên cũ')
    const updated = projects.update(
      projectUpdateSchema.parse({ id: p.id, name: 'Tên mới', description: 'Mới' })
    )
    expect(updated).toMatchObject({ id: p.id, name: 'Tên mới', description: 'Mới' })
    expect(updated.updatedAt).toBeGreaterThanOrEqual(p.updatedAt)
  })

  it('xóa dự án', () => {
    const p = create('Sẽ bị xóa')
    expect(projects.remove({ id: p.id })).toEqual({ id: p.id })
    expect(projects.list()).toEqual([])
  })

  it('sửa hoặc xóa dự án không tồn tại thì báo lỗi dễ hiểu', () => {
    expect(() => projects.update({ id: 999, name: 'x', description: '' })).toThrow(UserError)
    expect(() => projects.remove({ id: 999 })).toThrow(UserError)
  })

  it('mỗi thay đổi đều ghi nhật ký, mới nhất đứng đầu', () => {
    const p = create('Đồ án')
    projects.update({ id: p.id, name: 'Đồ án 2', description: '' })
    projects.remove({ id: p.id })

    const log = activity.listRecent(10)
    expect(log.map((e) => e.type)).toEqual([
      'project.deleted',
      'project.updated',
      'project.created'
    ])
    expect(log[0].message).toContain('Đồ án 2')
  })

  it('xóa dự án không xóa nhật ký cũ (chỉ bỏ liên kết)', () => {
    const p = create('Đồ án')
    projects.remove({ id: p.id })
    const created = activity.listRecent(10).find((e) => e.type === 'project.created')
    expect(created?.projectId).toBeNull()
  })

  it('listRecent tôn trọng giới hạn số dòng', () => {
    for (let i = 0; i < 5; i++) create(`Dự án ${i}`)
    expect(activity.listRecent(3)).toHaveLength(3)
  })
})

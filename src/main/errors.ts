/**
 * Lỗi "dành cho người dùng": thông báo an toàn để hiện thẳng lên giao diện
 * (ví dụ "Không tìm thấy dự án"). Các lỗi khác bị ẩn chi tiết và chỉ ghi vào log.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

import log from 'electron-log/main'

// Nhật ký ghi ra file trong thư mục dữ liệu của app (xem đường dẫn ở trang Cài đặt).
// Không bao giờ ghi API key hay nội dung tài liệu riêng tư vào đây.
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.console.level = 'info'

export const logger = log

export function getLogFilePath(): string {
  return log.transports.file.getFile().path
}

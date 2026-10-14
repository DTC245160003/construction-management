# Middleware

Thư mục chứa các hàm xử lý chung cho request, ví dụ xác thực, kiểm tra dữ liệu
đầu vào hoặc xử lý lỗi khi bổ sung chức năng tương ứng.

- Middleware thông thường có dạng `(req, res, next)`; gọi `next()` để chuyển
  sang bước xử lý tiếp theo hoặc gửi response để kết thúc request.
- Đăng ký middleware dùng chung trong `src/app.js`, trước các route cần dùng nó.
- Middleware dành riêng cho một route được đăng ký tại file trong `src/routes`.
- Middleware xử lý lỗi có dạng `(err, req, res, next)` và đặt sau các routes.

Middleware `express.json()` hiện có được giữ lại trong `src/app.js`.

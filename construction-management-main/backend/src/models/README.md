# Models

Thư mục chứa các model truy vấn PostgreSQL, ví dụ `userModel.js` hoặc
`projectModel.js` khi bổ sung chức năng tương ứng.

- Dùng lại pool hiện có bằng `require("../config/database")`.
- Đặt câu lệnh SQL tại model; dùng truy vấn có tham số (`$1`, `$2`, ...)
  cho dữ liệu đầu vào.
- Controller gọi model và trả kết quả HTTP; model không sử dụng `req`, `res`.
- Các thay đổi cấu trúc bảng vẫn đặt trong `src/migrations`.

Hiện `GET /` chỉ trả về thông báo nên chưa cần model hay truy vấn database.

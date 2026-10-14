# Báo cáo nâng cấp các module điều hướng

Ngày xác nhận: 05/10/2026
Branch: `feature/remaining-navigation-modules`

## Kết quả theo module

| Module | Story / yêu cầu | Frontend | Backend và database | Quyền backend | Kiểm thử | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| Dự án | S-03, S-04 | Danh sách, tìm kiếm, lọc, tạo và cập nhật dự án; giữ `projectId` khi điều hướng | API danh sách/tạo/tổng quan; người tạo tự trở thành thành viên; lịch mặc định được tạo cùng dự án | Chỉ trả dự án người dùng tham gia; quản lý được cập nhật | PostgreSQL access/CRUD; Playwright tạo dự án và reload | DONE |
| Lịch làm việc | S-17, T-38–T-40 | Chọn ngày làm trong tuần; CRUD ngày nghỉ/lễ | Lịch theo dự án, chống trùng ngày; đánh dấu tiến độ cần tính lại; CPM quy đổi ngày làm việc và không trừ trùng Chủ nhật | Thành viên được xem; quản lý được sửa | Unit lịch làm việc; PostgreSQL CRUD; Playwright lưu/reload | DONE |
| Giao việc hiện trường | E-11, S-25, S-26, S-58 | Gán/đổi đội, kế hoạch khối lượng, báo ngày, vướng mắc kèm ảnh, lịch sử và cảnh báo | Team, assignment, lịch sử, daily progress idempotent, issue và notification; cảnh báo quá tải/vượt kế hoạch nhưng vẫn lưu | Quản lý phân công; worker chỉ thấy và báo cho đội mình | PostgreSQL worker isolation/403; Playwright manager/worker/issue | DONE |
| Nhật ký công trường | E-05, S-21–S-24, S-27, S-29–S-34 | Nhật ký responsive, lọc, nhiều ảnh, IndexedDB, trạng thái chờ sync, service worker và tự đồng bộ | UUID và input hash chống lặp; optimistic revision; dữ liệu ngày; khóa/mở khóa; trigger DB chặn ghi ngày đã khóa | Kỹ sư/quản lý ghi và khóa; chỉ admin mở khóa có lý do; tác giả hoặc quản lý được sửa | PostgreSQL CRUD/lock/idempotency; Playwright offline → reload → online → DB, ảnh và mobile | DONE |
| Nghiệm thu khối lượng | E-06, S-35–S-38 | Khối lượng hợp đồng, phiếu nháp/trình/duyệt/trả lại, ảnh và đối chiếu báo cáo đội | Lũy kế/khối lượng đợt tự tính; row lock và trigger DB chống vượt hợp đồng khi đồng thời; khóa phiếu duyệt | Kỹ sư/quản lý lập; chủ đầu tư/quản lý duyệt hoặc trả lại | PostgreSQL race condition/direct SQL guard; Playwright workflow thực | DONE |
| Thanh toán | E-08, S-43–S-45 | Tạo từ nghiệm thu đã duyệt, tổng/tạm giữ/thực trả, workflow và chi tiết dòng | Tính tiền bằng `NUMERIC`; mỗi nghiệm thu tối đa một đề nghị; transaction và trigger khóa hồ sơ duyệt | Admin/kế toán lập; chủ đầu tư/admin duyệt; worker và kỹ sư bị 403 | PostgreSQL reuse/concurrency/exact totals; Playwright trả lại, trình lại và duyệt | DONE |
| Chi phí & vật tư | E-09, S-46–S-48, S-52, S-53 | Dự toán, thực chi, CSV, chờ phân bổ, phân tích, kho và đối chiếu định mức | Version dự toán append-only; import CSV atomic/idempotent; giao dịch kho append-only; cập nhật tồn có điều kiện chống âm | Quản lý/kế toán được ghi; vai trò tài chính phù hợp được xem | PostgreSQL version/CSV/concurrent stock; Playwright cảnh báo, nhập/xuất và lỗi quá tồn | DONE |
| Ảnh hiện trường | E-07 | Upload, gallery, phân trang, lọc, chi tiết, thumbnail và ảnh gốc | Giữ byte ảnh gốc; Sharp tạo thumbnail dưới 1 MB; đọc EXIF/GPS; tính khoảng cách và đánh dấu ngoài bán kính | Thành viên hiện trường upload; ảnh luôn project-scoped; quyền xem được kiểm ở API | PostgreSQL byte/thumbnail/scope; Playwright upload/gallery/mobile | DONE |
| Báo cáo | E-10, S-49, S-50 | KPI tiến độ/tài chính, mốc, việc găng trễ và tải hồ sơ PDF | Tổng hợp trực tiếp từ dữ liệu dự án; notification trễ có dedupe; PDFKit tạo hồ sơ thật có ảnh/metadata/người duyệt | Ban quản lý/chủ đầu tư và vai trò được cấp quyền đọc; PDF kiểm tra project/item | PostgreSQL report/PDF; Playwright tải và kiểm `%PDF-`; render QA trực quan | DONE |
| Thông báo | S-54, S-19/T-45, S-58 | Badge sidebar động, chưa đọc/đã đọc, lọc, mark one/all và deep link | Notification DB, event key chống trùng, email outbox/retry; email chỉ chứa sự kiện và link | Chỉ người nhận trong dự án đọc/cập nhật thông báo của mình | PostgreSQL dedupe/preference/outbox; Playwright issue và payment return/read-all | DONE |
| Nhật ký hệ thống | S-39 | Lọc thời gian/user/module/action; bảng và chi tiết before/after | Audit log project-scoped; trigger append-only; không có API update/delete | Chỉ admin/project manager/manager xem | PostgreSQL direct delete/update guard; Playwright lọc và mở chi tiết | DONE |
| Cài đặt | S-54 và cấu hình đã có căn cứ | Tên tài khoản, email chỉ đọc, email preferences, thông tin dự án, link lịch, tọa độ/tâm/bán kính | Cập nhật hồ sơ an toàn, notification preferences, project site settings với revision | Người dùng sửa tên và preference của mình; quản lý sửa vị trí công trường | PostgreSQL revision/role protection; Playwright lưu preference và reload | DONE |

## API chính

Các API mới đều dùng session hiện tại, `credentials: include`, middleware đăng nhập, kiểm tra thành viên dự án và role ở backend.

- `/projects` và `/projects/:projectId/overview`
- `/projects/:projectId/calendar`, `/holidays`
- `/projects/:projectId/teams`, `/assignments`, `/issues`
- `/projects/:projectId/journals`, `/journals/sync`, `/journals/lock`
- `/projects/:projectId/photos` và `/photos/:photoId/:variant`
- `/projects/:projectId/contracts/:workItemId`, `/acceptance`, `/acceptance/:id/transition`
- `/projects/:projectId/payments`, `/payments/:id/transition`
- `/projects/:projectId/budgets`, `/costs`, `/costs/import`, `/materials`, `/inventory`, `/material-norms`
- `/projects/:projectId/reports`, `/reports/acceptance.pdf`, `/milestones`
- `/projects/:projectId/notifications`, `/audit-logs`, `/preferences`, `/settings`, `/account`

## Migration

- `012_create_project_operations.sql`: lịch dự án, đội, phân công, khối lượng hiện trường, vướng mắc, thông báo và audit log.
- `013_create_site_management.sql`: journal/offline UUID, ảnh, nghiệm thu, thanh toán, dự toán/thực chi, kho, preference/email outbox, vị trí công trường và mốc báo cáo.
- Cả `012` và `013` có migration down an toàn, từ chối rollback khi còn dữ liệu nghiệp vụ.
- Trạng thái database local sau kiểm tra: migration `001` đến `013` đều `applied`.

## Kiểm thử và build cuối

- Backend mặc định: 119 passed, 46 PostgreSQL tests được skip khi không cấp test DB.
- Backend PostgreSQL thật: 165/165 passed, 16 suites.
- Backend lint: passed, 0 warning.
- Frontend lint: passed, 0 warning.
- Frontend production build: passed; còn cảnh báo kích thước bundle 1.305 MB (gzip 400.08 kB), không chặn build.
- Playwright + Edge + PostgreSQL cô lập: 22/22 passed.
- PDF QA: mở được, một trang nội dung, tiếng Việt/ảnh/footer không cắt hoặc chồng; lỗi trang trắng do footer đã được sửa.

## Ghi chú vận hành

- Email in-app hoạt động độc lập. Gửi email ngoài cần cấu hình SMTP bằng các biến trong `backend/.env.modules.example`; không có thông tin SMTP giả trong source.
- Khi chưa đủ khối lượng kế hoạch để suy ra dự báo, báo cáo hiển thị “Chưa đủ dữ liệu để dự báo” thay vì tạo ngày giả.
- Login, Register, Home, Members, WorkItems và Schedule không bị redesign trong phần nâng cấp này. Route WorkItems dùng `WorkItemTreePage.jsx` để giữ chức năng cây hạng mục hiện có; file giao diện người dùng đang chỉnh trước đó vẫn được bảo toàn.
- Không push, không merge và không commit `.env`, secret, database dump hoặc `node_modules`.

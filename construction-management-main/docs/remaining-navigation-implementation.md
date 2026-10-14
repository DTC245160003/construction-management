# Remaining navigation: audit và kế hoạch triển khai

Ngày audit: 2026-10-05.

**Trạng thái: đang chờ đúng backlog `(2).xlsx`; chưa triển khai các module mới.**

Người dùng xác nhận sẽ cung cấp đường dẫn bản `(2)`. File tìm thấy trong Downloads không có hậu tố `(2)` chỉ được kiểm tra cấu trúc, chưa được dùng để chốt AC, permission hay schema. Tài liệu này là báo cáo audit ban đầu, sẽ cập nhật bằng kết quả triển khai và kiểm thử thực tế sau từng pha.

## 1. Git và bảo toàn thay đổi

- `git pull --ff-only origin main`: thành công, main đã cập nhật.
- Nhánh làm việc: `feature/remaining-navigation-modules`.
- Giữ nguyên tất cả thay đổi chưa commit của người dùng. Không stash, reset, merge, commit hoặc push.
- Đã sao lưu source/test hiện tại vào vùng local được Git ignore, không chứa `.env`, secret hoặc database.
- Trong bước audit này chỉ đọc PostgreSQL trong transaction `READ ONLY`; không sửa database hoặc migration.

## 2. Backend và schema hiện tại

Kiến trúc hiện có: Express routes, middleware session/project membership, controllers, services, models, PostgreSQL. Login sử dụng session cookie `construction.sid`, tra người dùng/quyền hiện tại từ database. Không có JWT cần thay thế.

API đã tồn tại:

| Nhóm | Endpoint |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout` |
| Project access | `GET /projects/:projectId`, chỉ trả `projectId` sau khi kiểm tra quyền |
| WorkItems | `GET/POST /projects/:projectId/items`, `PATCH/DELETE /projects/:projectId/items/:itemId` |
| Tasks | `GET/POST /projects/:projectId/tasks`, `PATCH /projects/:projectId/tasks/:taskId` |
| Dependencies | `GET /projects/:projectId/dependencies`, `POST/DELETE /projects/:projectId/tasks/:taskId/dependencies[/:dependencyId]` |
| Schedule | `GET /projects/:projectId/schedule`, hỗ trợ `critical=true` |

Database ứng dụng đã được kiểm tra trực tiếp: migrations 001–011 đều đã áp dụng. Các bảng hiện có: users, roles, user_sessions, projects, project_members, work_items, tasks, dependencies, schedule_results, schema_migrations. Migration mới tiếp theo phải bắt đầu từ 012; chưa tạo migration nào cho yêu cầu này.

Role thực tế trong database:

| ID hiện tại | Canonical role |
| --- | --- |
| 1 | admin |
| 2 | project_manager |
| 3 | engineer |
| 4 | worker |
| 5 | accountant |
| 6 | viewer |

Các ID chỉ được ghi nhận từ database, không dùng làm hằng số authorization. Project membership có role riêng. Một số route cũ cho phép tên `manager`/`member`, trong khi seed và database có `project_manager`/`worker`; cần đối chiếu AC trước khi chỉnh policy, không mở rộng quyền hàng loạt.

CPM engine đã có FS/SS/FF/SF, lag âm, forward/backward pass và slack. Schedule dùng graph loader hai truy vấn, Kahn/SCC, cache dirty và transaction khóa project. Chưa có lịch làm việc/ngày lễ, ngày khởi công dự án hoặc các trường thực tế để tính chậm tiến độ. Phần mở rộng phải tái sử dụng engine hiện tại.

## 3. Frontend và lỗi tích hợp đã ghi nhận

App hiện có `/login`, `/register`, `/home`, `/members`, `/work-items`, `/schedule`.

- Home: giao diện dashboard, dữ liệu mẫu và phần lớn menu chưa có route. Hai link WorkItems/Schedule vẫn hard-code project 2.
- Members: giao diện đã dựng, dùng demo theo yêu cầu UI trước; chỉ gọi API project access. Không có member CRUD/invitations/permission endpoint để nối dữ liệu thật.
- **WorkItems.jsx hiện chứa bản giao diện thành viên và `export default Members`**, không sử dụng WorkItemTree/TaskForm. Đây là thay đổi local cần sửa tích hợp sau khi giữ lại bản hiện tại; không được coi test WorkItems của lần chạy trước là xác nhận phiên bản này.
- WorkItemTree, TaskForm và services task/workItem vẫn có trong repository để tái sử dụng.
- Schedule giữ giao diện và API CPM hiện có.
- Login/Register có chỉnh sửa local mới của người dùng; tiếp tục giữ session flow và giao diện này.
- Lint Home có lỗi `react-hooks/immutability` trong RoleDonut tại `acc += len`. Đã đối chiếu bằng lint nội dung Home trước phần sửa menu: lỗi tồn tại từ trước.
- Test drawer Members có lỗi click overlay bị sidebar che ở tâm màn hình. Cần sửa vùng đóng drawer/kiểm tra tương tác trước khi chốt regression.

## 4. Kế hoạch theo dependency

Story dưới đây lấy từ prompt, **chưa xác nhận với bản Excel `(2)`**.

| Pha | Phạm vi | Story/task cần đối chiếu | Hiện trạng |
| --- | --- | --- | --- |
| A | Navigation, Projects, Calendar | S-03, S-04, S-17, T-38–T-40 | Chưa có project list/create, calendar hoặc holiday API |
| B | Field assignments, Journal, offline/sync | S-21–S-34, S-58, E-11 | Chưa có schema, API hoặc PWA |
| C | Acceptance và contract quantities | S-35–S-38 | Chưa có schema/API/workflow |
| D | Payments, retention, approvals | S-43–S-45 | Chưa có schema/API/workflow |
| E | Costs, budgets, materials, photos | S-40–S-42, S-46–S-48, S-52, S-53 | Chưa có schema/API/upload storage |
| F | Reports/PDF, notifications, audit, settings | S-39, S-49, S-50, S-54, S-19/T-45, S-58 | Chưa có API hoặc background delivery |

Trước mỗi pha: đối chiếu Epics/Backlog/Tasks/Sprints/DoD-DoR, ghi lại AC, permission và phần Later/Could. Sau đó triển khai migration mới nếu cần, model/service/controller/routes, frontend và kiểm thử. Không tự phát minh workflow cho story chưa refine.

Các quyết định kỹ thuật đã có căn cứ từ repository:

1. Tái sử dụng session auth, middleware membership và project context qua query string.
2. Tái sử dụng API/service/component đã có; sửa lỗi WorkItems trước khi kiểm tra module mới dựa trên task.
3. Tách navigation dùng chung theo cách giữ nguyên bố cục các trang đã có; không thay đồng loạt CSS của Home/Members/WorkItems/Schedule.
4. Giữ migrations 001–011 và CPM; mở rộng bằng migration mới và adapter lịch theo AC được xác nhận.
5. Dữ liệu production lấy từ PostgreSQL; trạng thái thiếu dữ liệu hiển thị rõ, không dùng fixture để lấp số liệu.
6. Các nghiệp vụ concurrent và idempotent cần test PostgreSQL thật, không chỉ test mock.

## 5. Kiểm thử cần chạy theo pha

- Regression: login/register session, project isolation 403, WorkItems, TaskForm, dependencies, CPM, cache Schedule, Members.
- A: project creation/membership transaction, project visibility, lịch 6 ngày, holiday duplicate, holiday trùng ngày nghỉ, schedule invalidation.
- B: worker/team isolation, assignment history và overload warning, journal validation/lock/unlock, UUID idempotency, version conflict, offline persistence/retry.
- C: cumulative acceptance không vượt hợp đồng trong transaction và khi có request đồng thời; return reason; approved immutability.
- D: approved acceptance only, unique acceptance usage, retention, permissions và approved immutability.
- E: budget versioning, cost allocation, inventory concurrency/nonnegative balance, photo access/metadata/suspicion.
- F: report aggregation/PDF thực, notification unread count/preferences, audit append-only, settings/logout.
- UI: từng menu mở đúng route, projectId được giữ, missing project state, loading/error/empty, desktop/tablet/mobile.

## 6. Kết quả kiểm tra hiện tại

- Backend `npm run lint`: đạt trên source hiện tại. `git diff --check`: đạt. Đối chiếu SHA-256 với snapshot đầu audit: không file source/test hiện có nào bị sửa trong bước audit.
- Backend mới: chưa thêm endpoint, chưa thêm migration, chưa chạy test xác nhận module mới.
- Frontend mới cho remaining modules: chưa thêm page/service.
- Các lần kiểm tra của công việc Members trước đó: build đạt (cảnh báo bundle >500 kB); lint toàn frontend lỗi RoleDonut có sẵn; lần Playwright gần nhất 15/16 đạt, lỗi drawer nêu trên.
- Các kết quả trước đó không thay thế regression trên các chỉnh sửa Login/Register/WorkItems mới nhất.
- Chưa claim hoàn thành bất kỳ pha A–F nào.

## 7. Những phần đang chờ

- Đường dẫn chính xác của `Nền tảng điều hành thi công công trình(2).xlsx`. Người dùng chọn cung cấp bản này, không dùng thay bằng file không có `(2)` trong Downloads.
- Story AC, Later/Could, permission chi tiết và DoD/DoR sẽ được trích từ bản đó. Chưa có cơ sở để đánh dấu story nào đủ điều kiện triển khai hoặc bị loại khỏi scope.
- Sau khi có nguồn đúng, bổ sung endpoint/migration/page/permission/test/file changed cụ thể theo kết quả thực tế.

## 8. Manual demo checklist dự kiến

Từng mục chỉ được đánh dấu khi đã chạy được với backend/database thật:

- [ ] Dự án: chỉ thấy dự án mình tham gia; tạo mới và được thêm membership.
- [ ] Lịch: đổi ngày làm việc/ngày lễ, tải lại vẫn lưu.
- [ ] Giao việc: gán đội; worker chỉ thấy việc đội mình, báo khối lượng/vướng mắc.
- [ ] Nhật ký: tạo, khóa, mở khóa có lý do, offline rồi sync không duplicate.
- [ ] Nghiệm thu: lập/gửi/duyệt/trả lại; không vượt hợp đồng.
- [ ] Thanh toán: lấy phiếu đã duyệt, tính tiền/tạm giữ, không dùng phiếu hai lần.
- [ ] Chi phí/vật tư: nhập dự toán, thực chi, nhập/xuất kho và đối chiếu.
- [ ] Ảnh: upload/xem/lọc, metadata và nghi vấn hiển thị đúng.
- [ ] Báo cáo: số liệu thật và tải PDF.
- [ ] Thông báo: badge thật, đánh dấu đọc, preference.
- [ ] Audit: đọc/lọc; không có sửa/xóa.
- [ ] Cài đặt: cấu hình có quyền, logout.
- [ ] Toàn bộ menu đúng route, không có placeholder hoặc projectId mặc định.

## 9. Thay đổi ở bước audit

Chỉ thêm tài liệu này vào phần source được theo dõi. Các thay đổi frontend đã tồn tại từ công việc Members và các chỉnh sửa local của người dùng; chưa được coi là triển khai remaining modules. Không push hoặc tạo PR trong bước audit.

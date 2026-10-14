# SPRINT 2 — T-11 → T-17 RESULT

Ngày kiểm tra: 2026-09-30. Overall: **COMPLETE**.

## Audit trước khi sửa

- Git sạch, không có file modified/untracked từ trước. Không có AGENTS.md áp dụng trong repository/các thư mục cha đã kiểm tra.
- Backend: Node.js 24, Express 5, PostgreSQL/pg, CommonJS; Jest 30 và Supertest. Factory route/controller/model nhận dependencies để kiểm thử; service đang có auth và CPM.
- Frontend: React 19, Vite 8, Ant Design 6, axios; ban đầu có lint/build, chưa có test script/framework frontend.
- Migration cuối là 008; đã đọc cả up/down của `008_create_projects_and_work_items.sql`. `projects.id` và `work_items.id` là SERIAL (INTEGER); các FK dùng INTEGER.
- Convention migration: `NNN_name.sql` và `NNN_name.down.sql`, lịch sử/checksum, transaction và advisory lock trong runner. Down chặn khi còn dữ liệu.
- Timestamp: `created_at`, `updated_at` kiểu TIMESTAMP DEFAULT CURRENT_TIMESTAMP; ứng dụng chủ động cập nhật updated_at.
- Lệnh: `npm run migrate`, `npm run migrate:rollback` (một migration/lần), `npm run migrate:status` trong backend.
- T-09 đã có `/work-items`, WorkItems.jsx, WorkItemTree.jsx, API `/projects/:projectId/items`; tái sử dụng cây và Form của Ant Design như T-05.
- T-11/T-12/T-13/T-14: chưa có bảng tasks/dependencies, API hay form task.
- T-15/T-16/T-17: chưa có graph loader, Kahn hoặc cycle detector. `cpmService.js` và `cpm.test.js` đã có T-18–T-21; giữ nguyên, bổ sung adapter từ schema mới sang interface CPM.
- Trước sửa: 10 suite, 97 test backend PASS; lint backend/frontend PASS; build frontend PASS (có cảnh báo chunk >500 kB từ trước). Ban đầu thiếu dependencies; npm ci đã được chạy. Các lỗi sandbox spawn EPERM khi cài/build được giải quyết bằng chạy lệnh được cấp quyền, không thay đổi cấu hình bảo vệ.

## Kết quả theo task

### T-11

Status: **COMPLETE**

Files:

- `backend/src/migrations/009_create_tasks.sql`
- `backend/src/migrations/009_create_tasks.down.sql`
- `backend/tests/sprint2.postgres.test.js`

Tests:

- Migration up: PASS trên PostgreSQL 17.11.
- Migration down: PASS; migrate lại PASS; down từ chối khi bảng còn dữ liệu.
- FK work_items: PASS, INTEGER → work_items.id, ID không tồn tại bị 23503.
- duration_days = 1: PASS.
- duration_days = 0 / âm: DB reject 23514; NULL và số thập phân qua tham số cũng bị từ chối.

### T-12

Status: **COMPLETE**

Files:

- `backend/src/models/taskModel.js`, `backend/src/services/taskService.js`
- `backend/src/controllers/taskController.js`, `backend/src/routes/taskRoutes.js`, `backend/src/app.js`
- `backend/src/models/workItemCrudModel.js`, `backend/src/controllers/workItemController.js`, `backend/src/middleware/errorHandler.js`
- `frontend/src/components/TaskForm.jsx`, `frontend/src/components/WorkItemTree.jsx`
- `frontend/src/pages/WorkItems.jsx`, `frontend/src/services/taskApi.js`, `frontend/src/styles/WorkItems.css`
- `backend/tests/sprint2.postgres.test.js`, `frontend/tests/tasks.spec.js`

Tests:

- Create task: PASS từ cây trên Edge headless; API thật ghi PostgreSQL PASS.
- Update task: PASS trên giao diện và API thật; PATCH hỗ trợ giữ các trường không gửi.
- Frontend duration validation: PASS, nhập 0 / -2 / 1.5 báo lỗi tại ô và không gửi POST.
- Backend duration validation: PASS trên create/update với 0 / -1 / 1.5 / NULL / chuỗi / vượt giới hạn INTEGER.
- Parent work_item blocked: PASS trong lựa chọn UI và API create/update.
- Cross-project work item/task: PASS, bị từ chối.
- Thêm task và thêm hạng mục con đồng thời: PASS, khóa hàng chung đảm bảo chỉ một thao tác thành công.
- Xóa hạng mục chứa task: PASS, trả 409 và giữ dữ liệu.

### T-13

Status: **COMPLETE**

Files:

- `backend/src/migrations/010_create_dependencies.sql`
- `backend/src/migrations/010_create_dependencies.down.sql`
- `backend/tests/sprint2.postgres.test.js`

Tests:

- Migration up/down/re-up: PASS, rollback bảo vệ dữ liệu.
- FS/SS/FF/SF: PASS trực tiếp PostgreSQL.
- Invalid type: DB reject 23514.
- Self dependency: DB reject 23514.
- Duplicate predecessor/successor pair (kể cả đổi loại): DB reject 23505.
- Negative lag -2: DB accept; 0 và dương cũng PASS.
- FK cả hai phía và kiểu integer của lag: PASS; có index predecessor và successor.

### T-14

Status: **COMPLETE**

Files:

- Backend task model/service/controller/routes; `frontend/src/components/TaskForm.jsx`, `frontend/src/services/taskApi.js`.
- `backend/tests/sprint2.postgres.test.js`, `frontend/tests/tasks.spec.js`.

Tests:

- Predecessor search: PASS, gõ tên lọc danh sách trên Edge.
- Four dependency types: PASS, tạo FS/SS/FF/SF từ form và API.
- Lag: PASS với -2, 0, 3, -1 trên UI; API/DB kiểm tra integer.
- Duplicate UI/API validation: PASS, thông báo rõ cả kiểm tra local và lỗi 409 từ server.
- Self dependency: PASS, không có trong lựa chọn; backend từ chối trực tiếp.
- Danh sách hiện tại và xóa quan hệ: PASS.
- Tải theo bộ sưu tập items/tasks/dependencies, không fetch từng task. React StrictMode trong dev mount hai lần; số request vẫn cố định, không tăng theo số task.

### T-15

Status: **COMPLETE**

Files:

- `backend/src/services/scheduleService.js`, `backend/src/models/taskModel.js`
- `backend/tests/schedule.test.js`, `backend/tests/sprint2.postgres.test.js`

Tests:

- Nodes: PASS, giữ cả task độc lập.
- Edges: PASS, kề xuôi và kề ngược đúng.
- Indegree: PASS từng node.
- Exactly two DB queries: PASS với mock đếm query và hai SELECT thực trên PostgreSQL; lọc đúng project, không N+1.
- Adapter duration_days/dependency_type/lag_days → duration/type/lag của CPM: PASS, kiểm tra bằng calculateForwardPass hiện có.

### T-16

Status: **COMPLETE**

Files: `backend/src/services/scheduleService.js`, `backend/tests/schedule.test.js`.

Tests:

- Valid DAG: PASS với nhiều gốc, nhánh, điểm hội tụ, node độc lập và graph rỗng.
- Topological order: PASS, mọi task đúng một lần, predecessor đứng trước successor; không khóa vào một thứ tự duy nhất.
- 500 task performance: PASS dưới 1 giây. Đo bổ sung với seed 7919: 500 node / 4.346 cạnh, build + sort khoảng 3,4 ms trên máy kiểm tra (không bao gồm I/O DB).
- Non-recursive: PASS, queue có con trỏ head; chuỗi 20.000 task không tràn stack.
- Không mutate graph hoặc mảng đầu vào; chạy sort lặp lại cho kết quả hợp lệ.

### T-17

Status: **COMPLETE**

Files: `backend/src/services/scheduleService.js`, `backend/tests/schedule.test.js`.

Tests:

- No cycle: PASS, cycleTasks = [].
- 2-node cycle: PASS, đúng hai ID.
- 4-node cycle: PASS, đúng bốn ID.
- Downstream non-cycle nodes excluded: PASS; cả node phía trước vòng cũng không bị nhận nhầm.
- Hai vòng nối bằng node trung gian: PASS, loại node trung gian.
- Phòng vệ self-loop: PASS.
- Chỉ xét phần dư từ Kahn, dùng SCC không đệ quy và danh sách kề ngược để thu hẹp chính xác; không quét lại phần DAG đã xử lý.

## API và cách sử dụng

Các endpoint mới dùng session và project membership như route hiện có. Payload dùng tên cột snake_case.

| Method | Path | Nội dung |
| --- | --- | --- |
| GET | `/projects/:projectId/tasks` | Tất cả task thuộc project |
| POST | `/projects/:projectId/tasks` | `{work_item_id, name, duration_days}` |
| PATCH | `/projects/:projectId/tasks/:taskId` | Cập nhật một hoặc nhiều trường trên |
| GET | `/projects/:projectId/dependencies` | Tất cả dependency trong project |
| POST | `/projects/:projectId/tasks/:taskId/dependencies` | taskId là successor; `{predecessor_task_id, dependency_type, lag_days}` |
| DELETE | `/projects/:projectId/tasks/:taskId/dependencies/:dependencyId` | Xóa quan hệ của successor |

Mở `/work-items?projectId=<id>` trong session có quyền để tạo task ở một hạng mục lá. Lưu task trước, sau đó thêm các quan hệ trong cùng form. Constraint DB vẫn áp dụng khi bỏ qua frontend.

Module thuật toán độc lập HTTP:

```javascript
const { loadProjectGraph, topologicalSort } = require('./src/services/scheduleService');
const graph = await loadProjectGraph(pool, projectId);
const { sortedTasks, order, hasCycle, cycleTasks } = topologicalSort(graph);
// Kiểm tra hasCycle trước khi chuyển sortedTasks vào CPM hiện có.
```

## Kiểm thử có thể chạy lại

Trong backend:

```powershell
npm ci
npm test -- --ci
npm run lint
# Dùng PostgreSQL thử nghiệm, role có quyền CREATE SCHEMA.
$env:SPRINT2_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/TEST_DATABASE'
npm test -- --ci
```

Suite PostgreSQL tự tạo schema `sprint2_test_<uuid>`, chạy runner thật, kiểm tra INSERT/API, down/up và xóa đúng schema đó khi xong. Không chạm schema ứng dụng. Khi thiếu biến môi trường, 15 test PostgreSQL được ghi SKIP, không coi là PASS. Đợt xác minh này đã cung cấp biến môi trường và chạy đủ **125/125 test, 12/12 suite, không skip**.

Trong frontend:

```powershell
npm ci
# Máy đã có Microsoft Edge:
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm test
npm run lint
npm run build
```

Trên máy không có Edge, cài Chromium bằng `npx playwright install chromium` và bỏ biến PLAYWRIGHT_CHANNEL. Playwright khởi động Vite trên cổng 5175. **3/3 test trình duyệt PASS**. Các test UI dùng API mock có kiểm tra payload/request để kiểm tra form; API và persistence được kiểm thử riêng bằng Supertest với PostgreSQL thật. Đây không phải bộ test xuyên suốt đăng nhập UI → PostgreSQL.

Lint backend/frontend PASS; build production PASS. Cảnh báo bundle >500 kB đã có ở baseline, vẫn còn; chưa mở rộng phạm vi sang tối ưu bundle.

## Existing code reused

- Runner migration và convention T-08, không sửa migration 001–008.
- Cây T-09, CRUD hạng mục, axios credentials và proxy `/projects`.
- Form validation/layout Ant Design theo T-05.
- Middleware auth/project membership, error handler, factory controller/model.
- `cpmService.js`, toàn bộ 97 test cũ: giữ nguyên.

## Files created

- `backend/src/migrations/009_create_tasks.sql`
- `backend/src/migrations/009_create_tasks.down.sql`
- `backend/src/migrations/010_create_dependencies.sql`
- `backend/src/migrations/010_create_dependencies.down.sql`
- `backend/src/models/taskModel.js`
- `backend/src/services/taskService.js`
- `backend/src/services/scheduleService.js`
- `backend/src/controllers/taskController.js`
- `backend/src/routes/taskRoutes.js`
- `backend/tests/schedule.test.js`
- `backend/tests/sprint2.postgres.test.js`
- `frontend/src/services/taskApi.js`
- `frontend/src/components/TaskForm.jsx`
- `frontend/playwright.config.js`
- `frontend/tests/tasks.spec.js`
- `docs/sprint-2-result.md`

## Files modified

- `README.md`
- `backend/src/app.js`
- `backend/src/controllers/workItemController.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/models/workItemCrudModel.js`
- `frontend/.gitignore`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/components/WorkItemTree.jsx`
- `frontend/src/pages/WorkItems.jsx`
- `frontend/src/styles/WorkItems.css`

## Existing unrelated modified files left untouched

Không có: Git sạch trước khi bắt đầu. Không xóa code thành viên khác, không sửa test cũ, không commit/push/merge/rebase/reset.

## Final commands executed

- Backend: `npm test -- --ci` với SPRINT2_TEST_DATABASE_URL, `npm run lint`.
- PostgreSQL riêng tại 127.0.0.1:55432: `npm run migrate`, `npm run migrate:status`, `npm run migrate:rollback` hai lần, `npm run migrate`, `npm run migrate:status`.
- Frontend: `npm test` với PLAYWRIGHT_CHANNEL=msedge, `npm run lint`, `npm run build`.
- Đo buildGraph + topologicalSort trên mạng 500 task bằng Node.
- `git status --short`, `git diff --stat`, `git diff`, `git diff --check`; đọc thêm các file mới chưa tracked.

PostgreSQL thử nghiệm được khởi tạo riêng trong thư mục node_modules bị Git ignore, không dùng credentials/dữ liệu DB ứng dụng. Schema test đã được dọn; tiến trình PostgreSQL thử nghiệm được dừng sau xác minh. Migration mới chưa được áp dụng vào DB ứng dụng.

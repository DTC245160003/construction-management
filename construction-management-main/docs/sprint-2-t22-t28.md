# Sprint 2 — T-22 đến T-28

Kết quả kiểm tra ngày 2026-10-01: **COMPLETE**.

## Audit và phạm vi

Repository sạch trước khi bắt đầu. T-11–T-21 đã có model/API task, form task, graph hai truy vấn, Kahn, SCC phát hiện vòng và CPM. K-01 còn hard-code trong cpm.test.js; chưa có cache schedule_results, API hoặc trang tiến độ. TaskForm đã hiển thị message từ server nên tái sử dụng nguyên component.

Giữ nguyên migrations 001–010, cpmService.js, thuật toán buildGraph/Kahn/SCC, các unit test T-18–T-21 và giao diện Home/Login/Register. Hai thay đổi trong Login.jsx/Register.jsx chỉ đổi `let data = null` thành `let data` để sửa lỗi `no-useless-assignment` có sẵn; cả try/catch vẫn gán cùng giá trị và giao diện không đổi.

## T-22 — dữ liệu kiểm thử CPM

`backend/tests/data/cpm-scenarios.json` chứa K-01 gốc: tên, người đối chiếu/tính, ngày tính, tasks, dependencies, các bước tính tay và expected ES/EF/LS/LF/slack/isCritical. Tác giả gốc K-01 không được ghi trong repository nên không tự gán tên người thật; metadata ghi rõ Codex đối chiếu ngày 2026-10-01.

Test K-01 được chuyển sang đọc file; các unit test riêng T-18–T-21 còn nguyên. Mỗi scenario đi qua buildGraph → Kahn → CPM hiện có, đối chiếu đủ sáu kết quả của mọi task và kiểm tra không thiếu/thừa đáp án.

## T-23 — hai mạng tính tay mới

- K-02: 7 task, đủ FS/SS/FF/SF; FF có lag -1. Tổng thời gian 13 ngày; C và E có slack 4. Có phép tính xuôi/ngược riêng trong dữ liệu.
- K-03: nhánh A-B dài 9 ngày, C-D dài 6 ngày, hội tụ E dài 2 ngày. C và D có slack 3; A-B-E găng.

Các expected là số cố định từ tính tay, không sinh từ output của engine. Test đọc và kiểm tra toàn bộ giá trị, đồng thời xác nhận coverage bốn loại, lag âm và chênh lệch ba ngày.

## T-24/T-25 — chặn vòng trước khi ghi và giải thích bằng tên

POST dependency kiểm tra dữ liệu/project/pair, tải tasks + dependencies bằng hai truy vấn, thêm cạnh vào graph tạm và dùng topologicalSort hiện có. Nếu có vòng, trả 422 trước khi gọi INSERT.

Kiểm tra và ghi nằm trong cùng transaction `READ COMMITTED`, khóa hàng project bằng `FOR NO KEY UPDATE`. Hai request thêm cạnh vào cùng project được xử lý lần lượt: request sau nhìn thấy cạnh đã commit của request trước. Khóa này cũng được dùng bởi cập nhật task, xóa dependency và GET schedule. `NO KEY UPDATE` giữ tương thích với các khóa FK khi thêm hạng mục.

Từ tập node vòng đã tìm được, helper lần theo kề ngược để dựng một đường vòng thật theo nghĩa “chờ”. Không dùng thứ tự tùy ý của SCC làm chuỗi tên.

Ví dụ response:

```json
{
  "message": "Phát hiện vòng phụ thuộc: Công việc \"A\" chờ \"C\", Công việc \"C\" chờ \"B\", Công việc \"B\" lại chờ \"A\".",
  "cycle": [{"id":1,"name":"A"},{"id":3,"name":"C"},{"id":2,"name":"B"}]
}
```

IDs chỉ là metadata; message dùng tên. TaskForm giữ nguyên handler lỗi và đã có test trình duyệt chứng minh hiển thị nguyên message 422, không thêm quan hệ vào danh sách.

## T-26 — migration và cache nhất quán

Migration mới duy nhất: `011_create_schedule_results.sql` và file `.down.sql` tương ứng.

`schedule_results` có id, task_id INTEGER FK/UNIQUE, early_start, early_finish, late_start, late_finish, total_float, is_critical, calculated_at. Các mốc ngày dùng BIGINT để tổng thời lượng không tràn INTEGER; API chuyển về số JavaScript. calculated_at dùng TIMESTAMP theo convention repository.

`projects.schedule_needs_recalc` mặc định true. Trigger trên tasks/dependencies đánh dấu dirty trong chính transaction tạo/sửa/xóa, bao gồm SQL trực tiếp. Task/dependency API dùng khóa project trước khi thay đổi. Không có query riêng cho từng task khi tính hoặc lưu kết quả.

GET schedule khóa project, chỉ load graph/tính CPM khi dirty. Project rỗng được trả `[]` mà không gọi CPM trên mảng rỗng. Nếu graph có vòng, transaction rollback, giữ cache cũ và dirty=true; cache cũ không được trả cho client như kết quả hợp lệ.

Thay thế toàn bộ kết quả và đặt dirty=false trong một transaction bằng DELETE theo project + INSERT bulk từ JSON. Khi ghi lỗi, kết quả cũ và trạng thái dirty được giữ nguyên; không có trạng thái nửa cũ/nửa mới. GET tiếp theo khi clean chỉ đọc cache, không load graph hay chạy CPM.

Down 011 chặn nếu schedule_results còn dữ liệu, theo convention bảo vệ dữ liệu của repository. Kiểm thử xóa dữ liệu fixture riêng trước khi down; không xóa cache/dữ liệu ứng dụng tự động. Sau down/up, project mặc định dirty để tính lại.

## T-27 — API mới

| Method | Path | Kết quả |
| --- | --- | --- |
| GET | `/projects/:projectId/schedule` | `{ schedule: [...] }`, tất cả task của project |
| GET | `/projects/:projectId/schedule?critical=true` | Chỉ task găng; vẫn tính/lưu toàn bộ project khi dirty |

Mỗi task có `id, name, duration_days, work_item_id, es, ef, ls, lf, slack, isCritical, calculated_at`. Sắp xếp ES tăng dần rồi ID để ổn định khi bằng ES. `critical=false` tương đương không lọc; giá trị khác trả 400.

Route dùng requireAuth và requireProjectMember như task routes; không có projectId hard-code trong backend. Không đăng nhập trả 401, không có membership/role phù hợp trả 403. Graph vòng trả 422 kèm chuỗi tên như T-25.

## T-28 — trang tiến độ

Trang `/schedule?projectId=<id>` có liên kết từ cây hạng mục và quay lại cây, bảng đủ tám cột, nhãn chữ **Găng**/**Không găng**, checkbox “Chỉ hiện công việc găng”. Mốc ngày hiển thị “Ngày 0”, “Ngày 4”… theo mốc tương đối kể từ khởi công, không tự gán ngày lịch khi project chưa có ngày khởi công.

Có loading, empty state riêng cho project rỗng/bộ lọc rỗng, Alert lỗi/cycle bằng tên, nút tải lại. Request cũ bị hủy khi đổi project/filter; projectId không hợp lệ không gửi API. CSS giới hạn trong trang mới, bảng cuộn ngang trên màn hình hẹp. Không triển khai Gantt.

## Kiểm thử và kết quả

- Baseline backend: 125/125 test PASS sau khi instance PostgreSQL thử nghiệm sẵn sàng. Lần đầu PostgreSQL bị sandbox chặn tín hiệu phục hồi; chạy instance riêng ngoài sandbox đã xử lý vấn đề môi trường này.
- Baseline frontend lint: 2 lỗi gán biến thừa tại Login.jsx/Register.jsx; đã sửa tối thiểu như mô tả trên.
- Backend cuối: **13 suite, 144/144 test PASS, không skip**, gồm unit và PostgreSQL thật.
- Frontend cuối: **9/9 test Playwright PASS** trên Edge headless; gồm cả ba test cũ T-12/T-14.
- `npm run lint` backend/frontend: PASS.
- `npm run build` frontend: PASS; còn cảnh báo chunk >500 kB, không phải lỗi build.
- Migration 011: up → down → up → status PASS trên instance thử nghiệm. FK/unique, down bảo vệ dữ liệu và re-up giữ task đã được kiểm tra bằng test PostgreSQL.
- `git diff --check`: PASS. Đã xác nhận không có diff migrations 001–010 hoặc cpmService.js.

Test mới bao phủ:

- Đủ sáu trường CPM cho K-01/K-02/K-03.
- Unit: cycle được phát hiện trước INSERT, cạnh hợp lệ được ghi với lag âm, đường vòng trả về theo đúng cạnh dù có nhiều vòng và đuôi phía sau.
- PostgreSQL: A→B→C rồi C→A trả 422, DB vẫn có hai cạnh; hai cạnh đồng thời không thể cùng tạo vòng.
- API: khớp toàn bộ đáp án của ba scenario, sort ES, critical=true, project isolation, auth/membership, query không hợp lệ, project rỗng và chuỗi tên khi gặp cycle từ dữ liệu import.
- Cache: mọi thao tác yêu cầu đều đánh dấu dirty, clean GET không đọc graph/ghi lại, ghi bulk lỗi rollback toàn bộ, hai GET đồng thời chỉ tính một lần, cập nhật task không bị bỏ sót bởi cache; tổng ngày vượt giới hạn INTEGER.
- UI: tám cột, nhãn găng, bộ lọc, loading/empty/API error/retry, Alert cycle trên Schedule và TaskForm, projectId không hợp lệ.

Test trình duyệt dùng API mock để kiểm tra giao diện/payload. API và persistence được kiểm thử riêng bằng Supertest/PostgreSQL thật; không tuyên bố đã chạy E2E đăng nhập giao diện đến database. CI được bổ sung service PostgreSQL 17 và biến SPRINT2_TEST_DATABASE_URL để chạy suite DB hiện có, không bỏ qua suite đó khi CI chạy. Chưa chạy workflow trên GitHub từ phiên này.

## Chạy lại

Sau khi review và chọn đúng DB ứng dụng, chạy trong backend:

```powershell
npm run migrate:status
npm run migrate
```

Kiểm thử dùng DB riêng có quyền CREATE SCHEMA:

```powershell
# backend
$env:SPRINT2_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/TEST_DATABASE'
npm run lint
npm test -- --ci

# frontend
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm test
npm run build
npm run lint
```

Nếu dùng Chromium thay Edge, cài bằng `npx playwright install chromium` và bỏ PLAYWRIGHT_CHANNEL. Suite DB tạo schema riêng theo UUID và dọn đúng schema đó; không dùng schema ứng dụng.

## Files thêm

- `backend/tests/data/cpm-scenarios.json`
- `backend/tests/dependencyCycle.test.js`
- `backend/src/migrations/011_create_schedule_results.sql`
- `backend/src/migrations/011_create_schedule_results.down.sql`
- `backend/src/models/projectTransaction.js`
- `backend/src/models/scheduleModel.js`
- `backend/src/controllers/scheduleController.js`
- `backend/src/routes/scheduleRoutes.js`
- `frontend/src/pages/Schedule.jsx`
- `frontend/src/styles/Schedule.css`
- `frontend/src/services/scheduleApi.js`
- `frontend/tests/schedule.spec.js`
- `docs/sprint-2-t22-t28.md`

## Files sửa

- `backend/src/app.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/models/taskModel.js`
- `backend/src/services/taskService.js`
- `backend/src/services/scheduleService.js`
- `backend/tests/cpm.test.js`
- `backend/tests/sprint2.postgres.test.js` (giữ test cũ; rollback 011 trước 010/009 và bổ sung assertions)
- `frontend/src/App.jsx`
- `frontend/src/pages/WorkItems.jsx`
- `frontend/tests/tasks.spec.js`
- `frontend/src/pages/Login.jsx` (một khai báo biến)
- `frontend/src/pages/Register.jsx` (một khai báo biến)
- `.github/workflows/ci.yml`
- `README.md`

Không có phần T-22–T-28 còn thiếu. Migration mới chỉ được áp dụng vào PostgreSQL thử nghiệm trong phiên này; DB ứng dụng chưa thay đổi. Không commit/push, không thêm .env/node_modules/secret vào Git.

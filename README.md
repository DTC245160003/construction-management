# Construction Management

Hệ thống quản lý xây dựng.

## Ứng dụng thống nhất Sprint 1–8

Mã nguồn chính là `backend/` và `frontend/`: một Express backend phục vụ cả
React build và API trên cùng địa chỉ, một database được chọn từ cấu hình hiện
có. Các tài khoản cũ dùng nguyên email, mật khẩu và quyền dự án; không cần tài
khoản QA. Báo cáo chuyển đổi và các mục chưa xác minh:
[FINAL-INTEGRATION-SPRINT1-8](docs/FINAL-INTEGRATION-SPRINT1-8.md).

Chủ hệ thống đã chọn hồ sơ Sprint 4–5 làm chuẩn và xác nhận quyền Super Admin.
Checkpoint hợp nhất 15/10 tại **http://localhost:3082/login** giữ 9 tài khoản, 3 dự án,
4 hạng mục, 14 công việc và các quyền theo dự án. Backup/restore, mapping FK
và rollback import đã kiểm thử đạt; hai nguồn và copy đối chiếu 3080/3081 giữ
nguyên. **Chưa nâng cấp database nguồn hoặc chuyển production.** Xem
[đối chiếu và kết quả](docs/integration/ACCOUNT-SOURCES.md).
Chủ hệ thống đã xác nhận **UAT Windows 3082 PASS**: tài khoản cũ, 3 dự án,
dữ liệu, menu và phân quyền đúng. Samsung dùng PWA cũ tại **http://localhost:4174**
qua ADB Wi-Fi/reverse, cùng database hợp nhất. Worker và launcher PWA cũ đã
được xác minh sau reboot; UAT sử dụng chung Samsung PASS theo chủ máy.
Các tiêu chí offline cụ thể còn thiếu bằng chứng; sync đang held theo yêu cầu.
Docker build/runtime với PostgreSQL thử riêng đã PASS tại http://localhost:4188/login.
[Hướng dẫn Windows/Samsung](docs/integration/WINDOWS-SAMSUNG-UAT.md).

Phần đăng xuất sidebar được tiếp tục tại checkpoint 20/10/2026; xem
[mã sửa, lệnh kiểm thử và trạng thái Samsung](docs/integration/logout/README.md).

Ngày 20/10 đã khôi phục server laptop 3082 và PWA 4174, cùng bundle đã kiểm
thử. Database hiện có 10 tài khoản, 3 dự án, 14 memberships, 6 nhật ký và 11
ảnh; không restore snapshot cũ. Kết nối ADB và đăng xuất thực tế Samsung còn
chờ thiết bị. Xem [checkpoint kết nối](docs/integration/connectivity/README.md).

Khôi phục các server đã xác minh và ADB reverse khi thiết bị kết nối:

```powershell
npm --prefix backend run pwa:recover -- --windows
```

Launcher không migrate/seed/đổi mật khẩu hoặc sửa `.env`. Các bước khởi động
với database chính bên dưới chỉ thực hiện sau khi phương án dữ liệu và nâng
cấp nguồn được chấp thuận; trạng thái hiện tại được ghi trong báo cáo.

Giữ `backend/.env` đã có. Với checkout mới, dùng `backend/.env.example` làm mẫu,
cấu hình database mong muốn và secret ngẫu nhiên; không ghi secret vào Git.
`DATABASE_URL` ưu tiên hơn `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` khi có.
Không trỏ ứng dụng chính vào `construction_sprint68_test` để thay thế dữ liệu cũ.

```powershell
# Chỉ cài dependencies ở checkout mới:
npm --prefix backend ci
npm --prefix frontend ci
npm run build
npm run db:status
npm run db:check
$env:PORT='3080'
npm start
```

Sau khi schema đã được nâng cấp và kiểm tra, mở `http://localhost:3080/login`
và đăng nhập bằng tài khoản cũ. Khởi động không tự migrate hoặc seed. Nếu còn
migration pending, phải xác nhận backup hợp lệ, thử restore/nâng cấp bản sao và
đối chiếu dữ liệu trước khi chạy migration trên database gốc. Không đổi mật
khẩu hoặc tự cấp Super Admin để vượt lỗi phân quyền. CLI thủ công vẫn yêu cầu
đúng database/email/hành động được quản trị viên xác nhận.

`npm run lint`, `npm run test:unit` và `npm run test:integration` ở root dùng
chung các bộ kiểm thử hiện có. Integration chỉ dùng database test riêng. Docker
Compose mặc định và staging dùng Dockerfile tại root để đóng gói cùng ứng dụng;
backend/Dockerfile giữ chế độ API-only cho phát triển.

Chuẩn bị Render HTTPS: [hướng dẫn](docs/integration/RENDER-HTTPS.md). Các lệnh
`demo:sprint45`/`demo:sprint68` phía dưới chỉ dành cho dữ liệu kiểm thử cũ;
không phải lệnh khởi động ứng dụng thống nhất.

Sprint 2 T-11–T-17: xem [audit, API, cách kiểm thử và kết quả](docs/sprint-2-result.md).

Sprint 2 T-22–T-28: xem [dữ liệu CPM, chống vòng, cache và trang tiến độ](docs/sprint-2-t22-t28.md).

Sprint 3 T-29–T-45: xem [tích hợp Gantt, actual progress, lịch làm việc, baseline và milestone](docs/sprint3/HANDOFF.md). Renderer dùng DOM cho thanh công việc và SVG cho quan hệ phụ thuộc; danh sách lớn được giới hạn số hàng render theo vùng đang xem.

## Công nghệ sử dụng

### Backend
- Node.js 24
- Express.js
- PostgreSQL
- Jest
- ESLint
- GitHub Actions CI

---

# Backend Setup

## 1. Cài đặt thư viện

```bash
cd backend
npm install
```

## 2. Chạy backend và kiểm tra code

Chạy trong thư mục `backend`:

```bash
npm start
npm run lint
npm test -- --ci
```

`npm start` chạy server cho đến khi nhấn `Ctrl+C`. Chạy lint và test ở terminal
khác hoặc sau khi dừng server. Khi phát triển, có thể dùng `npm run dev`.

## 3. Chạy backend bằng Docker tại máy local

Cần Docker Engine/Docker Desktop đang chạy ở chế độ Linux containers và Docker
Compose v2 trở lên. Các lệnh Docker dưới đây chạy từ thư mục gốc repository.

```bash
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml up --build -d --wait
docker compose -f docker-compose.yml ps
```

API có tại `http://localhost:3001/`. Project Docker có tên
`construction-management-docker`, dùng cổng khác với server Node.js chạy trực
tiếp trên cổng mặc định `3000`. Có thể đổi cổng Docker qua biến môi trường
`BACKEND_DOCKER_PORT`.

Compose đọc các biến database từ `backend/.env` và ghi đè `DB_HOST` trong
container thành `host.docker.internal` để truy cập PostgreSQL trên máy host.
Điều này áp dụng cho cấu hình `DB_*`. Nếu có `DATABASE_URL`, URL vẫn được ưu
tiên và hostname trong URL phải truy cập được từ container; Compose không tự
viết lại URL hoặc sửa file `.env` riêng.
Nếu database ở máy khác, đặt biến môi trường `DOCKER_DB_HOST` trước khi chạy
Compose. File `backend/.env` không bị sửa. `localhost` bên trong container là
chính container đó; PostgreSQL cần cho phép kết nối từ mạng Docker.

Image dùng Node.js 24, chỉ cài dependencies chạy ứng dụng và chạy dưới user
`node`. File `.env` và `node_modules` của máy local không đi vào build context.
Healthcheck gọi `GET /`; đây là kiểm tra HTTP của backend, không kiểm tra database.

Xem log hoặc dừng riêng project Docker local:

```bash
docker compose -f docker-compose.yml logs -f backend
docker compose -f docker-compose.yml down
```

## 4. Chuẩn bị staging

Hiện chưa có máy chủ staging. `docker-compose.staging.yml` là cấu hình độc lập,
chạy bằng một tùy chọn `-f`, không ghép với `docker-compose.yml`. Nó dùng project
`construction-management-staging`, cổng mặc định `3002` và file môi trường riêng.
Không có PostgreSQL container hay lệnh migration tự động trong hai cấu hình.

Khi có máy chủ, lấy source code tại commit cần triển khai, cài Docker/Compose
và tạo file `backend/.env.staging` từ `backend/.env.staging.example`. Ví dụ trên
Linux, chỉ thực hiện lần đầu để không ghi đè cấu hình staging đã có:

```bash
cp -n backend/.env.staging.example backend/.env.staging
```

Trên PowerShell, chỉ sao chép khi file đích chưa tồn tại:

```powershell
if (-not (Test-Path backend/.env.staging)) {
    Copy-Item backend/.env.staging.example backend/.env.staging
}
```

Điền thông tin PostgreSQL dành riêng cho staging vào file mới trước khi deploy.
File mẫu chỉ chứa giá trị minh họa; database và tài khoản staging cần được chuẩn
bị riêng. Nếu PostgreSQL cùng máy host, có thể dùng `host.docker.internal`; nếu
ở máy khác, dùng địa chỉ máy database. `.env.staging` được Git bỏ qua và không
được đóng gói vào image.

Sau khi cấu hình xong, chạy trên máy staging từ thư mục gốc repository:

```bash
docker compose -f docker-compose.staging.yml config --quiet
docker compose -f docker-compose.staging.yml up --build -d --wait
docker compose -f docker-compose.staging.yml ps
```

API mặc định chỉ mở trên `http://127.0.0.1:3002/` của máy staging, phù hợp để
đặt reverse proxy cùng máy phía trước. Truy cập từ máy khác cần cấu hình reverse
proxy hoặc chủ động đặt `STAGING_BIND_ADDRESS` cùng firewall phù hợp.

Các biến tùy chọn được đặt trong môi trường shell chạy Compose:

| Biến | Mặc định | Mục đích |
| --- | --- | --- |
| `STAGING_ENV_FILE` | `./backend/.env.staging` | Đường dẫn file môi trường staging |
| `STAGING_IMAGE_TAG` | `staging` | Tag image; nên dùng commit SHA khi triển khai |
| `STAGING_PORT` | `3002` | Cổng trên máy host |
| `STAGING_BIND_ADDRESS` | `127.0.0.1` | Địa chỉ host nhận kết nối |

Các biến này điều khiển Compose, không được lấy từ file `env_file` của service.
Luôn dùng file staging khi xem log hoặc dừng staging để chọn đúng project:

```bash
docker compose -f docker-compose.staging.yml logs -f backend
docker compose -f docker-compose.staging.yml down
```

## 5. CI và chuẩn bị deploy staging

Workflow `.github/workflows/ci.yml` chạy khi push hoặc pull request vào `main`:

1. Checkout code và setup Node.js 24.
2. Chạy `npm ci`, lint và Jest như trước.
3. Khi test đạt, build Docker image với tag là commit SHA.
4. Kiểm tra cấu hình staging bằng `docker compose config --quiet`, sử dụng file
   mẫu không chứa thông tin bí mật.

Bước staging hiện chỉ kiểm tra cấu hình: không chạy container, không kết nối
database, không push image lên registry và không deploy lên máy chủ. Image được
build trong CI chỉ nằm trên runner của lần chạy đó. Khi có máy staging, sẽ cần
chọn cách chuyển image/source tới máy chủ, cấu hình credentials, GitHub
Environment `staging` và cơ chế kích hoạt deploy trước khi thêm job triển khai.

Tham khảo [cấu hình môi trường của Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
và [lệnh kiểm tra cấu hình Compose](https://docs.docker.com/reference/cli/docker/compose/config/).

## 6. Migration users và roles (T-04 S-02)

Các lệnh bên dưới chạy trong thư mục `backend` và sử dụng database cấu hình
trong `backend/.env`. Chỉ chạy lệnh thay đổi schema sau khi đã review migration.
Docker và CI không tự chạy migration. Phần T-04 chỉ tạo schema; seed sáu role
chuẩn được bổ sung cùng chức năng đăng ký ở mục 7.

| Migration | Nội dung |
| --- | --- |
| `001_create_users.sql` | Migration T-01 gốc, giữ nguyên |
| `002_create_roles.sql` | Tạo `roles`: `id`, `name` duy nhất, `created_at`, `updated_at` |
| `003_update_users.sql` | Email `VARCHAR(255) UNIQUE NOT NULL`, đổi `password` thành `password_hash VARCHAR(255) NOT NULL`, thêm `role_id` tham chiếu `roles(id)` |

`users` được nâng cấp bằng `ALTER TABLE`, không tạo lại hoặc xóa dữ liệu.
`username` cũ được giữ như cột legacy và cho phép NULL để tài khoản mới không
bắt buộc có username. `role_id` cho phép NULL; migration không tự gán quyền.
ID, email, mật khẩu và timestamps cũ được giữ nguyên. Đổi tên cột mật khẩu không
băm lại dữ liệu; tầng ứng dụng sẽ chịu trách nhiệm tạo/kiểm tra hash Argon2id.
Các cột timestamp tiếp tục dùng `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` như T-01;
`updated_at` không tự thay đổi khi cập nhật một bản ghi.

### Database đã chạy migration T-01

Runner cũ không lưu lịch sử migration. Trước tiên xem trạng thái; migration 001
sẽ hiện `pending` nếu chưa có lịch sử, dù bảng `users` đã tồn tại:

```bash
npm run migrate:status
```

Sau khi review và xác nhận đúng database, ghi nhận T-01 đã chạy bằng lệnh sau
(chỉ chạy một lần). Baseline kiểm tra các cột, kiểu dữ liệu, defaults, primary
key và unique email trước khi ghi vào `schema_migrations`. Nó không chạy lại
SQL tạo bảng `users`:

```bash
npm run migrate:baseline
npm run migrate
npm run migrate:status
```

Nếu schema khác T-01, baseline dừng để kiểm tra thủ công. Không sửa lịch sử để
bỏ qua lỗi này. `npm run migrate` cũng dừng nếu thấy bảng `users` chưa có lịch
sử, thay vì tự cho rằng migration 001 đã chạy.

### Database mới, chưa có bảng users

Không cần baseline. Sau khi review, chạy:

```bash
npm run migrate
```

Runner chạy các file `NNN_ten_migration.sql` theo thứ tự và bỏ qua các migration
đã ghi nhận, kể cả khi một migration mới hơn đã được áp dụng trước đó. File
`.down.sql` chỉ dùng khi rollback. Mỗi lần chạy dùng một
transaction trên cùng connection; nếu lỗi thì toàn bộ thay đổi schema và lịch
sử của lần chạy đó được rollback. Checksum phát hiện sửa đổi migration đã áp
dụng; khóa advisory ngăn hai runner chạy đồng thời trong cùng database/schema.

Nếu database cũ đã ghi nhận `012_add_actual_progress.sql` hoặc bản T-34 cũ
`015_add_actual_progress.sql`, runner chỉ nhận diện lại migration khi checksum
được biết và các cột cùng constraint thực tế trên `tasks` khớp. Migration
T-34 hiện dùng version 016 để không xung đột với migration `015_add_task_actuals`
từ `main`. Khi chạy `up`, việc đổi tên bản ghi lịch sử và áp dụng các migration
còn thiếu nằm trong cùng transaction. Nếu kiểm tra không khớp, runner dừng mà
không sửa lịch sử; không tự đổi tên hoặc xóa dòng trong `schema_migrations`.

### Rollback

Sau khi review, lệnh sau hoàn tác **một migration mới nhất** mỗi lần gọi:

```bash
npm run migrate:rollback
```

Sau khi áp dụng 001, 002, 003, lần đầu rollback 003; lần tiếp theo rollback 002.
Migration 001 không có file down: runner dừng ở schema T-01, không xóa bảng users.

Rollback 003 sẽ bị chặn nếu có user đã được gán `role_id`, email dài quá 150 ký
tự, hoặc `username` là NULL. Những trường hợp này không thể trở về schema cũ mà
giữ nguyên dữ liệu/ràng buộc. Rollback 002 sẽ bị chặn nếu `roles` có dữ liệu.
Runner không tự xóa role, bỏ quyền, cắt email hay tự điền username để vượt qua
các điều kiện trên. Khi bị chặn, transaction và lịch sử migration được giữ nguyên.

Các bài Jest cho runner dùng client giả, không kết nối database. Kiểm thử schema
và các điều kiện rollback trên PostgreSQL cần được thực hiện trên database thử
nghiệm riêng trước khi áp dụng vào môi trường có dữ liệu.

## 7. Đăng ký, đăng nhập và RBAC

Backend cung cấp `POST /auth/register`, `POST /auth/login` và `POST /auth/logout`.
Form `Register.jsx` gọi API bằng axios. Bố cục và CSS được giữ nguyên; dropdown
đăng ký chỉ hiển thị Kỹ sư, Công nhân và Người xem.

### Chuẩn bị database và session

Trong thư mục `backend`, sau khi review migration và xác nhận đúng database:

```bash
npm ci
npm run migrate:status
npm run migrate
npm run seed:roles
```

Database T-04 đã có lịch sử migration thì không chạy baseline lại. Nếu chỉ có
bảng T-01 từ runner cũ, thực hiện baseline theo mục 6 trước.

Nếu `/auth/register` trả `500`, xem terminal backend trong môi trường
`development` (mặc định khi chưa đặt `NODE_ENV`). Log `[backend:error]` có tên
thao tác, mã PostgreSQL và stack; không ghi body, tham số SQL hoặc `error.detail`
vì có thể chứa mật khẩu/hash. Client vẫn nhận thông báo lỗi chung.

Lỗi `42P01: relation "roles" does not exist` tại `userModel.findRoleByName`
nghĩa là database chưa được migrate, không phải chỉ thiếu seed. Database T-01
còn cột `password`, chưa có `password_hash`, `role_id`, `fullname`. Với database
đúng schema T-01 và chưa có lịch sử migration, chạy trong `backend`:

```bash
npm run migrate:baseline
npm run migrate
npm run seed:roles
npm run migrate:status
```

Baseline chỉ ghi nhận schema cũ sau khi kiểm tra; không tạo lại bảng `users`.
Nếu đã chạy migration thì bỏ qua baseline. Sau khi cập nhật code, khởi động lại
backend để dùng log mới (`npm run dev` tự khởi động lại khi file thay đổi).

Kiểm tra trong PostgreSQL, không cần đọc toàn bộ hash:

```sql
SELECT name FROM roles ORDER BY name;

SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass AND contype IN ('u', 'f');

SELECT u.id, u.fullname, u.email, r.name AS role, u.created_at,
       u.password_hash LIKE '$argon2id$%' AS is_argon2id
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE u.email = 'test@gmail.com';
```

Dùng email thuần trong JSON, ví dụ `"email": "test@gmail.com"`.

- Migration 004 thêm `failed_login_attempts INTEGER DEFAULT 0` và
  `locked_until TIMESTAMP NULL`.
- Migration 005 tạo `user_sessions` cho PostgreSQL session store.
- Migration 006 thêm `fullname VARCHAR(255)`, giữ nguyên dữ liệu user cũ.
- `seed:roles` thêm sáu role chuẩn bằng `ON CONFLICT DO NOTHING`, có thể chạy
  lại, không tạo tài khoản admin hay xóa role đã có.

Sáu role dự án là `admin`, `project_manager`, `engineer`, `worker`, `accountant`,
`viewer`; quyền thực tế được đọc từ `project_members.role_id`. Đăng ký công khai
mặc định `system_role=user`, không có membership và không chọn role trên UI.
API giữ tương thích các giá trị cũ `engineer`, `worker`, `viewer` như metadata
tài khoản; các giá trị này không cấp quyền dự án hay quản trị hệ thống.
Giá trị cũ `employee` được ánh xạ sang `worker`; `manager` thành
`project_manager`, nên không được đăng ký công khai.

Mỗi tài khoản đăng ký mới phải có fullname và một role tồn tại trong bảng roles;
`role_id` do backend tra cứu, không lấy từ client. Các tài khoản legacy chưa có
fullname/role vẫn giữ giá trị NULL hiện có; migration không tự đoán tên hoặc
cấp quyền cho các tài khoản này. Quyền quản trị toàn hệ thống chỉ dựa vào
`users.system_role=super_admin`, độc lập với `users.role_id` cũ.

Tham khảo `backend/.env.auth.example` và thêm các biến cần thiết vào `.env`
hiện có, giữ nguyên cấu hình `DB_*`. Sinh secret bằng:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Đặt kết quả vào `SESSION_SECRET`. Production bắt buộc có secret tối thiểu
32 byte; local chưa có secret sẽ dùng giá trị ngẫu nhiên mỗi lần khởi động,
khiến cookie cũ không còn dùng được sau restart. Cookie có `HttpOnly`,
`SameSite=Lax`, thời hạn 8 giờ; session chỉ lưu `userId`, dữ liệu session nằm
trong PostgreSQL. Dùng `SESSION_COOKIE_SECURE=false` cho HTTP local, `true`
cho HTTPS. Nếu có đúng một reverse proxy tin cậy phía trước, đặt `TRUST_PROXY=1`.
Cookie `Secure` không được gửi qua HTTP, kể cả khi backend chạy Docker local.

### Chạy frontend và backend

Terminal backend:

```bash
cd backend
npm start
```

Terminal frontend:

```bash
cd frontend
npm ci
npm run dev
```

Mở URL Vite hiển thị, thường là `http://localhost:5173/register`. Vite chuyển
request `/auth` tới `http://127.0.0.1:3000`, nên không cần mở CORS cho mọi origin.
Nếu backend chạy cổng khác, đặt `API_PROXY_TARGET` trước khi khởi động Vite,
ví dụ trong PowerShell:

```powershell
$env:API_PROXY_TARGET = "http://127.0.0.1:3001"
npm run dev
```

Proxy cũng áp dụng cho `npm run preview`. Khi deploy frontend build tĩnh,
cần reverse proxy cùng origin chuyển `/auth` tới backend; Vite dev proxy không
được đóng gói trong thư mục `dist`.

### API đăng ký và cách test

Gửi `Content-Type: application/json` tới `POST /auth/register`:

```json
{
  "fullname": "Nguyễn Văn A",
  "email": "nguyenvana@example.com",
  "password": "Example-password-123",
  "role": "engineer"
}
```

Backend trim fullname, chuẩn hóa email thành chữ thường, yêu cầu password ít
nhất 8 ký tự và tối đa 1024 byte. Password không bị trim và chỉ được lưu dưới
dạng Argon2id. API trả `201` cùng thông báo và user công khai; không trả password
hoặc hash. Đăng ký không tự tạo session đăng nhập.

| Tình huống | HTTP |
| --- | --- |
| Đăng ký hợp lệ với engineer/worker/viewer | `201` |
| Email đã tồn tại, kể cả request đồng thời | `409` |
| Dữ liệu không hợp lệ hoặc role chưa được seed | `400` |
| Yêu cầu admin/project_manager/accountant | `403` |

Thử form với email mới, kiểm tra thông báo thành công; gửi lại email đó để thấy
lỗi trùng email. Mật khẩu xác nhận không khớp bị chặn tại form. Dùng Postman hoặc
API client gửi trực tiếp `role: "admin"` để kiểm tra backend trả `403`.

`POST /auth/login` nhận `{ "email": "...", "password": "..." }`. Khi đúng,
backend reset số lần sai, xóa trạng thái khóa, đổi session ID và lưu session.
Email không tồn tại, sai mật khẩu và tài khoản đang khóa đều trả `401` với
`Thông tin đăng nhập không chính xác`. Sai 5 lần sẽ khóa 15 phút; khi hết khóa,
lần sai tiếp theo bắt đầu từ 1. Transaction và khóa hàng PostgreSQL bảo vệ bộ
đếm khi có nhiều request đồng thời. `POST /auth/logout` hủy session và xóa cookie.

Trong lần cập nhật này chỉ form đăng ký được nối API; `Login.jsx` vẫn là handler
demo hiện có. Có thể test API login/logout bằng Postman có lưu cookie hoặc
Supertest. Chưa thêm API quản trị tạo user đặc quyền.

### Dùng middleware RBAC cho API tiếp theo

```javascript
const { requireAuth, requireSystemAdmin } = require("../middleware/auth");

router.get("/admin/users", requireAuth, requireSystemAdmin, controller.users);
```

`requireAuth` đọc user, trạng thái và quyền hệ thống từ database ở mỗi request;
`requireSystemAdmin` bảo vệ API quản trị, còn `requireProjectMember` kiểm tra
membership và vai trò dự án hiện tại. Header, query, body và role cũ lưu ở client
không cấp quyền. Chưa đăng nhập/tài khoản khóa trả `401`, sai quyền trả `403`.

### Project membership và cây work items (T-06 đến T-10)

Migration `007_create_project_members.sql` tạo bảng thành viên dự án với khóa
ngoại tới `users` và `roles`, unique trên cặp `(user_id, project_id)` và index
trên `project_id`. Migration `008_create_projects_and_work_items.sql` tạo
`projects`, `work_items`, khóa tự trỏ `work_items.parent_id` và index trên
`parent_id`; migration này cũng hoàn thiện khóa ngoại từ `project_members` tới
`projects`.

Sau khi review database, chạy:

```bash
cd backend
npm run migrate:status
npm run migrate
```

Middleware project dùng nguyên tắc deny-by-default. Các route dưới
`/projects/:projectId` yêu cầu session hợp lệ và membership phù hợp; route
không khai báo role được phép bị từ chối. API work items hiện có:

| Method | Path | Mục đích |
| --- | --- | --- |
| `GET` | `/projects/:projectId/items` | Lấy toàn bộ cây hạng mục |
| `POST` | `/projects/:projectId/items` | Tạo hạng mục gốc hoặc hạng mục con |
| `PATCH` | `/projects/:projectId/items/:itemId` | Sửa tên, trạng thái hoặc cha |
| `DELETE` | `/projects/:projectId/items/:itemId` | Xóa hạng mục |

Các endpoint cần cookie session của user đã đăng nhập. Frontend dev chạy tại
`http://localhost:5173` dùng Vite proxy `/auth` và `/projects` tới backend
`http://127.0.0.1:3000`; không trộn hai host khi kiểm tra cookie.

T-10 được kiểm tra ở backend, không phụ thuộc frontend:

- Đổi `parentId` thành chính hậu duệ của hạng mục trả `422`; thông báo chứa tên
  hạng mục và tên hậu duệ, không trả ID.
- Xóa hạng mục còn cây con trả `409`; thông báo chứa tên hạng mục.
- Truy vấn cây dùng `WITH RECURSIVE`, nên frontend chỉ hiển thị lỗi backend.

Ví dụ kiểm thử bằng PowerShell sau khi lưu cookie vào `cookies.txt`:

```powershell
curl.exe -i -X PATCH http://localhost:3000/projects/1/items/3 `
  -H "Content-Type: application/json" `
  -b cookies.txt `
  -d '{"title":"Hạng mục mẫu 2","parentId":7,"status":"todo"}'

curl.exe -i -X DELETE http://localhost:3000/projects/1/items/3 `
  -b cookies.txt
```

Frontend hiển thị cây tại `/work-items`, hỗ trợ mở rộng/thu gọn và CRUD tại
chỗ. Kiểm tra toàn bộ backend và frontend:

```bash
cd backend
npm test
npm run lint

cd ../frontend
npm run lint
npm run build
```

Kiểm tra code:

```bash
cd backend
npm run lint
npm test -- --ci
```

Trong thư mục `frontend`, chạy `npm run lint` và `npm run build`.
Rollback 004 bị chặn khi còn số lần sai/trạng thái khóa; 005 bị chặn khi bảng
session có dữ liệu; 006 bị chặn khi đã lưu fullname. Seed roles không tự hoàn
tác/xóa role khi rollback schema để tránh mất dữ liệu hoặc quyền đang sử dụng.

### Super Admin và quyền dự án (migration 018)

Quyền hệ thống `user`/`super_admin` độc lập với sáu vai trò dự án. Tài khoản
đăng ký mới chưa có quyền dự án; Super Admin chỉ được cấp cho email đã tồn tại
bằng CLI tại server, có xác nhận chính xác database và hành động:

```powershell
cd backend
npm run admin:bootstrap -- --database=construction_sprint45_demo --email=dtc245160003@ictu.edu.vn --dry-run
npm run admin:bootstrap -- --database=construction_sprint45_demo --email=dtc245160003@ictu.edu.vn
```

Nhập `GRANT_SUPER_ADMIN:construction_sprint45_demo:dtc245160003@ictu.edu.vn`
khi CLI yêu cầu. Sau đó refresh/đăng nhập lại và mở **Quản trị hệ thống** để
phân quyền từng dự án. Không có API hoặc nút nâng Super Admin. Bộ guard bảo vệ
Super Admin hoạt động cuối cùng; audit và dữ liệu cũ được giữ.

Demo dùng `npm run demo:sprint45` trong backend, preview ở localhost:4174.
DB gốc đang lệch checksum 014 nên chưa được nâng cấp; không sửa lịch sử để
vượt guard. Chi tiết triển khai, test, lệnh demo và file thay đổi nằm trong
[báo cáo Super Admin](docs/super-admin/SUPER_ADMIN_REPORT.md).

### Sprint 6–8: nghiệm thu, thanh toán và báo cáo

Mã nguồn bổ sung quản lý hợp đồng lá/cộng lên cây, nghiệm thu lũy kế có khóa
PostgreSQL, phiếu điều chỉnh riêng, thanh toán theo phiếu đã duyệt, tạm giữ
theo dự án, dự toán có phiên bản, CSV thực chi/chờ phân bổ và hồ sơ PDF tiếng
Việt. Các trang dùng dữ liệu API thật: `/acceptance`, `/payments`,
`/costs-materials`, `/reports`, `/site-photos` với `?projectId=<id>`.
Xem [đối chiếu tài liệu gốc](docs/sprint6-8-requirements.md) và
[báo cáo triển khai](docs/sprint6-8-implementation-report.md).

Migration mới là `021_sprint6_8_financial_integrity`; không đổi 017–020.
Bản `009_create_task_dependencies` trùng số trong main được lưu nguyên byte
ở `backend/src/migrations/archive/`. Runner dừng nếu lịch sử đã ghi nhận bản
009 này, thay vì tự sửa lịch sử. Không chạy migration lên database ứng dụng
trước khi kiểm tra lịch sử, backup và thử nâng cấp trên bản sao riêng.

Kiểm thử PostgreSQL riêng, không xóa database:

```powershell
cd backend
npm run test:sprint68 -- --ci
node scripts/test-sprint68.cjs --frontend test:sprint68
node scripts/test-sprint68.cjs --frontend test:sprint45
```

Runner đọc thông tin kết nối từ `.env`, tạo `construction_sprint68_test` nếu
chưa có và chạy các bộ kiểm thử trong schema UUID riêng. Không ghi mật khẩu
hoặc connection string vào báo cáo. Cần quyền tạo database test lần đầu.
Frontend cần `npm ci`, `npm run build`; Playwright cần Chrome trên Windows
hoặc Chromium đã cài trên Linux.

Demo chỉ dùng database test: chạy `npm run demo:sprint68` trong backend,
sau đó mở terminal khác:

```powershell
cd frontend
$env:API_PROXY_TARGET='http://127.0.0.1:3068'
npm run build
npm run preview -- --host 127.0.0.1 --port 4176 --strictPort
```

Đăng ký tài khoản kiểm thử ở `http://127.0.0.1:4176/register`. Nếu cần quản trị,
cấp quyền thủ công bằng CLI `admin:bootstrap` với đúng
`--database=construction_sprint68_test` và email đã đăng ký. Demo không tự
tạo tài khoản quản trị, không gửi email và không nâng cấp database ứng dụng.

`PHOTO_MAX_CAPTURE_AGE_DAYS` mặc định 7 ngày và
`PHOTO_FUTURE_TOLERANCE_HOURS` mặc định 24 giờ, nhận số dương tối đa 365.
Đây là ngưỡng đối chiếu để người duyệt xem xét, không phải kết luận ảnh giả.
EXIF không có múi giờ hiển thị đúng giờ máy ảnh với nhãn chưa khai báo múi giờ;
GPS thiếu được ghi rõ, không suy diễn tọa độ.

`PDF_FONT_PATH` trỏ tới font TrueType hỗ trợ tiếng Việt nếu dùng font riêng.
Docker image cài `fonts-dejavu-core` và mặc định dùng DejaVu Sans; Windows có
fallback Arial. Thiếu font trả lỗi cấu hình rõ ràng, không xuất PDF mất dấu.

`GET /health` kiểm tra ứng dụng và PostgreSQL (200/503).
`HEALTH_DATABASE_TIMEOUT_MS` mặc định 2000, giới hạn 100–10000.
Biến môi trường webhook, cách chạy monitor độc lập và các bước xác minh gửi
cảnh báo cả nhóm nằm trong [hướng dẫn S-51](docs/sprint6-8/S51-HEALTH-MONITORING.md).
Không có webhook thật trong repository. Chưa xác minh cảnh báo staging thật.

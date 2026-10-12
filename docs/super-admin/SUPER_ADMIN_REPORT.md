# Super Admin và phân quyền hai cấp

Kiểm chứng ngày **09/10/2026**, Windows, Node.js 24, PostgreSQL 17, Chrome/Playwright. Thay đổi nằm trong worktree `D:\Project\construction-management-new\.worktrees\sprint4-5`, branch `feature/sprint4-5`. Công việc Sprint 4–5 và T46/T47 có sẵn được giữ nguyên; không reset Git, push hoặc merge.

**Đã triển khai và kiểm chứng hệ thống Super Admin, CLI thủ công và quyền dự án.** Backend đạt 241/241; frontend đạt 74 PASS, 0 FAIL, 1 SKIP trong các lượt chạy cuối; backup/restore native đạt 4/4. Ca worker bị skip ở bộ mặc định đã PASS trong lượt chạy opt-in riêng. Không cộng lượt này thành một test unique mới.

Demo đang chạy tại **http://127.0.0.1:4174/**, backend **http://127.0.0.1:3000/**, database **`construction_sprint45_demo`** đã áp dụng migration 018. Email **`dtc245160003@ictu.edu.vn`** tồn tại, hoạt động, hiện có `system_role=user`. CLI `--dry-run` đã kiểm chứng đúng database và tài khoản. **Chưa thực hiện cấp Super Admin cho email này**; người quản trị thực hiện bước xác nhận thủ công bên dưới. Cấp/thu hồi thực tế bằng executable CLI đã PASS trên schema PostgreSQL thử nghiệm riêng.

## Cấu trúc quyền và bảo mật

`users.system_role` chỉ nhận `user` hoặc `super_admin`, mặc định `user`. `users.is_active` điều khiển quyền đăng nhập và truy cập phiên hiện có. Migration 018 giữ nguyên `users.role_id`, mật khẩu và dữ liệu cũ. `users.role_id` là metadata tương thích; giá trị `admin` cũ ở đó không tạo quyền hệ thống.

Quyền dự án dùng `project_members.role_id` và bảng `roles` hiện có. Một người có thể có vai trò khác nhau trong các dự án. Không tạo bảng role hoặc cơ chế phân quyền song song. Alias `manager`/`member` cũ được giữ ở những endpoint đã hỗ trợ.

| Vai trò | Phạm vi và chức năng chính |
|---|---|
| `user` | Chỉ thấy dự án có membership; không tạo dự án toàn hệ thống, không gọi `/admin/*`. |
| `super_admin` | Xem mọi dự án, tạo/quản lý dự án, quản lý người dùng và membership, đọc nhật ký thay đổi quyền. Khi quản lý dự án sử dụng quyền quản lý hiệu lực, không cần thêm membership vào từng dự án. |
| `admin` — Ban quản lý | Quản lý thành viên, vai trò, lịch, giao việc và nghiệp vụ được cấp trong dự án mình. Không có quyền hệ thống. |
| `project_manager` — Chỉ huy trưởng | Quản lý tiến độ, giao việc và các nghiệp vụ quản lý trong dự án được phân công; không truy cập dự án khác hay `/admin/*`. |
| `engineer` — Kỹ sư giám sát | Cây hạng mục, task/dependency/Gantt và nhật ký/nghiệm thu theo quyền nghiệp vụ; không có quyền tài chính hoặc quản trị hệ thống. |
| `worker` — Đội trưởng | Danh sách, chi tiết việc của đội được giao; báo khối lượng/vướng mắc và ảnh theo quyền hiện trường. Không cấp quyền cây/Gantt/quản trị để tránh 403. |
| `accountant` — Kế toán | Thanh toán, chi phí, vật tư, báo cáo tài chính được cấp; không có Gantt/cây hạng mục hoặc chỉnh sửa nhật ký. |
| `viewer` — Chủ đầu tư | Đọc cây hạng mục/task/dependency/Gantt và thông tin được cấp. Không sửa các mục này hoặc chốt baseline; quyền mốc/nghiệm thu có sẵn của các Sprint trước được giữ theo endpoint nghiệp vụ. |

Đăng ký mới không chọn role trên UI, không tự tham gia dự án và không có Admin. API giữ tương thích các lựa chọn metadata ít quyền cũ; `role=super_admin/admin/project_manager/manager` bị từ chối 403. Các trường giả mạo `system_role`, `is_admin`, `role_id`, `project_id` không cấp quyền. Lời mời có token hợp lệ vẫn cấp đúng membership theo luồng S-28 đã có.

Mỗi API đọc tài khoản và trạng thái hiện tại từ PostgreSQL; mỗi API dự án kiểm tra membership hiện tại. Đổi vai trò hoặc gỡ thành viên có hiệu lực trên phiên đã đăng nhập, không chờ cookie hết hạn. UI lấy quyền từ `/auth/me`, `/projects` và overview mới khi refresh/đăng nhập lại; role trong localStorage không quyết định bảo mật. Khóa tài khoản làm phiên cũ và đăng nhập mới bị từ chối 401.

API quản trị không có chức năng nâng Super Admin. PATCH trạng thái từ chối payload đổi quyền hệ thống; DELETE tài khoản trả 405 để giữ dữ liệu và lịch sử. Trigger PostgreSQL chặn xóa, hạ quyền hoặc khóa Super Admin hoạt động cuối cùng. Bộ đếm nguyên tử trong `system_admin_guard` xử lý hai yêu cầu hạ quyền đồng thời, đảm bảo còn một người hoạt động; đây là dữ liệu đồng bộ, không phải nguồn role thứ hai. CLI và API ghi vào `audit_logs` hiện có, dùng cùng trigger append-only. Audit CLI ghi operator server/database và trước/sau, không ghi mật khẩu.

## Cấp Super Admin thủ công

CLI duy nhất là `backend/scripts/admin-bootstrap.cjs`. Script demo cũ `set-sprint45-demo-admin.cjs` và lệnh `demo:admin` đã được thay thế. CLI không tạo account, không đổi password hoặc membership, không tự chạy migration và không lấy database đích từ `DB_NAME` khi thiếu `--database`.

Trong terminal của người quản trị tại server:

```powershell
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\backend'

# Xem đúng database, email và quyền hiện tại; không thay đổi dữ liệu.
npm run admin:bootstrap -- --database=construction_sprint45_demo --email=dtc245160003@ictu.edu.vn --action=grant --dry-run

# Chạy trong terminal tương tác; nhập chuỗi xác nhận khi được hỏi.
npm run admin:bootstrap -- --database=construction_sprint45_demo --email=dtc245160003@ictu.edu.vn --action=grant
```

Chuỗi xác nhận chính xác:

```text
GRANT_SUPER_ADMIN:construction_sprint45_demo:dtc245160003@ictu.edu.vn
```

Nếu môi trường không có terminal tương tác, người vận hành có thể xác nhận rõ bằng tham số:

```powershell
npm run admin:bootstrap -- --database=construction_sprint45_demo --email=dtc245160003@ictu.edu.vn --action=grant --confirm=GRANT_SUPER_ADMIN:construction_sprint45_demo:dtc245160003@ictu.edu.vn
```

Script kiểm tra `current_database()` khớp database đã xác nhận trước transaction. Tên database không hợp lệ, email không tồn tại, tài khoản đang khóa, thiếu/sai xác nhận đều không được cấp quyền. Chạy lại cùng quyền là no-op, không tạo trùng account hay audit. Không đưa password vào command line. Chỉ vận hành CLI trong môi trường server có quyền quản trị được kiểm soát.

Thu hồi dùng `--action=revoke` và xác nhận `REVOKE_SUPER_ADMIN:DATABASE:EMAIL`. Khi tài khoản là Super Admin hoạt động cuối cùng, thao tác bị chặn; phải có người quản trị hoạt động khác trước. Sau cấp hoặc thu hồi, refresh hoặc đăng nhập lại bằng mật khẩu hiện có.

## Phân quyền trên giao diện

1. Sau khi cấp thủ công, đăng nhập và chọn **Quản trị hệ thống** ở menu.
2. Tab **Tài khoản** hiển thị người dùng, email, trạng thái, quyền hệ thống và các dự án/vai trò. Tìm theo tên/email; **Tải lại** lấy dữ liệu mới.
3. Chọn **Tạo / quản lý dự án**, tạo dự án bằng tên/địa điểm/ngày bắt đầu. Super Admin quản lý được cả dự án không có membership của mình.
4. Với người dùng đã đăng ký, chọn **Vai trò dự án**, chọn dự án và một trong sáu vai trò, rồi **Lưu vai trò dự án**. Có membership thì đổi vai trò; chưa có thì thêm vào dự án. Gán Ban quản lý không nâng quyền hệ thống của người đó.
5. Ban quản lý đăng nhập, vào **Thành viên & phân quyền** của dự án mình để thêm Kỹ sư hoặc gửi lời mời theo S-28. Liên kết lời mời có sẵn để sao chép; chưa cấu hình gửi email tự động.
6. Dùng **Gỡ khỏi …** để thu hồi quyền dự án, hoặc **Khóa/Mở tài khoản** để đổi trạng thái. UI yêu cầu xác nhận, giữ lịch sử và bảo vệ quản lý cuối cùng.
7. Tab **Nhật ký thay đổi quyền** hiển thị 500 bản ghi gần nhất của `system_admin`/`members`, có actor/công cụ, dự án và dữ liệu trước/sau. Các action thêm thành viên dùng tên `add` của audit sẵn có.

Không có nút nâng Super Admin trên trang đăng ký hoặc trang quản trị. [Ảnh desktop](evidence/system-admin-desktop.png) và [ảnh mobile 390 px](evidence/system-admin-mobile.png) được chụp từ các luồng PostgreSQL thật; bảng có cuộn ngang riêng, trang không tràn ngang và menu mobile thu lại đúng.

## Kết quả kiểm thử

| Nhóm | PASS | FAIL | SKIP | Thời gian / bằng chứng |
|---|---:|---:|---:|---|
| Backend Jest, 23 suite | 241 | 0 | 0 | 50,238 s; [JSON](backend-test-results.json) |
| Frontend unit | 17 | 0 | 0 | 0,211 s; Gantt/view model/calendar |
| UI regression | 32 | 0 | 1 | 112,892 s; [JSON](uiRegression-results.json) |
| Real regression | 12 | 0 | 0 | 66,018 s; [JSON](realRegression-results.json) |
| Sprint 4–5 offline/PWA | 9 | 0 | 0 | 134,791 s; [JSON](sprint45-results.json) |
| Super Admin real CLI + UI | 3 | 0 | 0 | 20,316 s; [JSON](playwright-results.json) |
| Worker development opt-in | 1 | 0 | 0 | 7,419 s; [JSON](workerDevelopment-results.json) |
| **Frontend: tổng lượt gọi** | **74** | **0** | **1** | Không phải số test unique; ca worker được gọi lại riêng. |
| Backup/restore native T46/T47 | 4 | 0 | 0 | [JSON](backup-regression-results.json), [log](backup-regression-output.txt) |
| Backend/frontend lint và production build | PASS | 0 | — | Không cộng vào số test. Build còn cảnh báo bundle lớn. |

Sáu file `.postgres.test.js` có 73 ca, là tập con của 241, không cộng thêm. Riêng `systemAdmin.postgres.test.js` có 12 ca: một ca kiểm tra tham số CLI trước kết nối và 11 ca dùng PostgreSQL thật. Các suite có database đã chạy đầy đủ, không skip vì thiếu kết nối. [Tổng hợp máy đọc](test-summary.json) ghi kết quả và thời gian cuối. Không có Playwright retry/flaky trong các lượt cuối.

| Yêu cầu G | Bằng chứng đã PASS |
|---|---|
| 1. Đăng ký không có Admin | Backend kiểm tra default và payload giả; browser đăng ký không có combobox role, `/auth/me` trả `user`. |
| 2. `role=super_admin` không nâng quyền | Backend và browser API nhận 403, không có account đặc quyền được tạo. |
| 3. Người thường gọi quản trị → 403 | Bao gồm account có legacy global `admin`, Ban quản lý dự án và Đội trưởng. |
| 4. Cấp thủ công thành công | Transaction PostgreSQL và executable CLI thật; kiểm tra database/xác nhận, giữ password/membership, idempotency/audit. |
| 5. Super Admin thấy quản trị/tạo dự án | Browser refresh sau CLI grant, mở menu và tạo dự án thành công. |
| 6. Gán Ban quản lý thành công | UI gán role `admin` trong dự án; system role của thành viên vẫn `user`. |
| 7. Ban quản lý thêm Kỹ sư | UI thêm account có sẵn và kiểm chứng membership trong dự án được cấp. |
| 8. Kỹ sư chỉ xem đúng dự án | API 200 ở dự án có quyền, 403 ở dự án khác; viewer đọc cây/task/dependency/Gantt, ghi bị 403. |
| 9. Đội trưởng chỉ xem việc đội mình | PostgreSQL team scope + báo khối lượng; không có quản trị/cây/Gantt; UI menu đúng. |
| 10. Gỡ thành viên mất quyền ngay | API và UI gỡ, phiên đang đăng nhập nhận 403 ở request tiếp theo. |
| 11. Bảo vệ Super Admin cuối | CLI revoke, API khóa, SQL delete/demotion; hai demotion đồng thời; guard còn hoạt động sau restore. |
| 12. Giữ Sprint 1–5 | Auth, tree/task/dependency/CPM/Gantt, calendar/baseline/milestone, actual progress, giao việc, nhật ký, ảnh, nghiệm thu, thanh toán, vật tư, lời mời; offline 20 nhật ký + 30 ảnh, browser restart, replay, conflict/quota/update. |

Lệnh tái kiểm chứng:

```powershell
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\backend'
npm run lint
npm run test:postgres -- --json --outputFile=../docs/super-admin/backend-test-results.json

Set-Location '..\frontend'
npm run lint
npm run test:unit
npm run build
npm run test:system-admin
npm run test:sprint45
npm run test:real-regression
npm run test:ui-regression
npm run test:worker-dev
```

Không chạy đồng thời các suite production dùng chung port 3031/4175. Fixture tạo schema UUID riêng và tự dọn; native backup dùng database thử nghiệm riêng rồi dọn chính database do fixture tạo. Các kiểm thử không reset public schema hoặc dữ liệu người dùng.

## File và migration

[Danh sách file đầy đủ](FILES_CHANGED.txt) so sánh SHA-256 với đầu lượt yêu cầu Super Admin, bao gồm code, test và bằng chứng; không gộp công việc Sprint 4–5 có sẵn thành thay đổi mới.

Các nhóm code chính:

- Schema/CLI: `backend/src/migrations/018_system_administration.sql`, `.down.sql`; `backend/scripts/admin-bootstrap.cjs`; `backend/package.json`. Xóa bootstrap demo cũ và test tương ứng.
- Auth và quyền: `userModel.js`, `authService.js`, `middleware/auth.js`, `projectAccess.js`; controller/model/service project operations; routes task, work item, site management.
- API quản trị: `systemAdminService.js`, `systemAdminRoutes.js`, `app.js`; dùng lại service membership/audit và validation hiện có.
- UI: `SystemAdmin.jsx`, `SystemAdmin.css`, `App.jsx`, `DashboardLayout.jsx`, `navigation.js`, `Home.jsx`, `Register.jsx`, `WorkItemTree.jsx`, `WorkItemTreePage.jsx`, `Schedule.jsx`, `vite.config.js`.
- Kiểm chứng: `systemAdmin.postgres.test.js`, fixture backend E2E, test auth/migration/regression đã cập nhật kỳ vọng; `system-admin.real.spec.js`, config/package Playwright, CI và tài liệu.

Chỉ thêm migration **018**. So sánh 33 file up/down thuộc 001–017 với baseline: **không đổi nội dung**. 018 down bị chặn khi còn quyền/trạng thái/audit cần bảo toàn; roundtrip trên schema rỗng đã PASS. Tái sử dụng audit append-only của 012, không tạo audit store mới.

[Bằng chứng môi trường](environment-proof.json) xác nhận demo có hai account, email đích tồn tại; count/hash dữ liệu cũ trước/sau 018 khớp. Cấu hình `.env` không bị sửa. Database gốc `construction_management` vẫn chưa có cột `system_role`, vẫn lệch checksum migration 014, không áp dụng 018 hoặc sửa lịch sử tại đó.

## Chạy demo và phần chưa kiểm chứng

Hai server hiện được giữ chạy. Nếu cần khởi động lại, dừng đúng instance cũ trước, dùng hai terminal:

```powershell
# Terminal backend
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\backend'
$env:PORT='3000'
$env:SPRINT45_DEMO_DB='construction_sprint45_demo'
npm run demo:sprint45

# Terminal frontend
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\frontend'
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

Mở `/login`, cấp quyền bằng CLI như trên, đăng nhập bằng mật khẩu hiện có rồi vào `/system-admin`. Không có password demo hard-code. Dữ liệu demo được giữ qua restart; bootstrap mặc định không chạy khi khởi động.

Các giới hạn còn lại:

- **Email đích chưa được nâng quyền thực tế:** đã kiểm tra read-only; bước cuối là chạy CLI và xác nhận thủ công chính xác database/hành động.
- **Database gốc chưa nâng cấp:** checksum 014 lệch là vấn đề lịch sử có sẵn. Phải đối chiếu đúng bản migration triển khai và backup trước khi nâng cấp. Không chạy code mới trỏ vào DB gốc chưa có 018; dùng demo riêng. Không xóa DB, sửa checksum hoặc ghi đè dữ liệu để vượt guard.
- **CI từ xa/Docker chưa chạy:** workflow đã có bước Super Admin và artifacts; không push nên chưa có kết quả GitHub. Docker daemon không hoạt động trong lượt kiểm chứng; backup/restore đã chạy bằng PostgreSQL 17 native.
- **Acceptance thiết bị của Sprint 4–5:** chưa chứng minh cài PWA standalone trên điện thoại thật hoặc background sync hoàn tất khi ứng dụng đóng. Browser restart/offline/replay đã PASS nhưng không thay thế hai phép kiểm chứng này. Xem [báo cáo Sprint 4–5](../sprint4-5/SPRINT4_SPRINT5_REPORT.md).

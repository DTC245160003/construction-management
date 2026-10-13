# Báo cáo Sprint 4 + Sprint 5 — XÂY DỰNG SỐ

**Cập nhật 09/10/2026:** Mô hình quyền hai cấp và CLI hiện hành được trình bày trong [báo cáo Super Admin](../super-admin/SUPER_ADMIN_REPORT.md). Các số liệu dưới đây ghi nhận lượt bàn giao Sprint 4–5 ban đầu; kết quả hồi quy sau thay đổi quyền nằm trong báo cáo mới. `demo:admin` đã được thay bằng `admin:bootstrap` có xác nhận database/hành động.

Ngày kiểm chứng: **08/10/2026**, Windows, Node.js 24, PostgreSQL 17 local, Chrome/Playwright. Phạm vi: **14 Story / 40 SP**. Yêu cầu được lấy từ văn bản người dùng; workbook backlog được đọc làm tài liệu tham chiếu.

**Đã triển khai cả 14 Story; chưa tuyên bố hoàn thành 100% acceptance.** Kết quả hiện tại: **11 PASS, 0 FAIL, 3 BLOCKED về kiểm chứng môi trường**. S-27 còn cài/standalone trên điện thoại thật; S-30 còn kiểm chứng Background Sync tự chạy khi ứng dụng đóng; S-34 còn lượt chạy CI từ xa. Phần tương ứng đã có code và kiểm thử local, nhưng các phép kiểm chứng chưa thực hiện không được tính PASS.

Bản production local phục vụ tại **http://127.0.0.1:4174/**; backend **http://127.0.0.1:3000/** dùng database riêng `construction_sprint45_demo`. Đăng ký tại `/register`, cấp Super Admin thủ công bằng CLI bên dưới, refresh/đăng nhập lại để tạo dự án và phân quyền dự án. Không có tài khoản/mật khẩu demo hard-code. Database giữ dữ liệu giữa các lần khởi động.

## 1. Sprint 4 — 20 SP

Trong các bảng dưới, `P` là `/projects/:projectId`. Đường dẫn file tính từ root worktree `feature/sprint4-5`. Những API đã tồn tại được hoàn thiện và tái sử dụng.

| Story | Chức năng triển khai | File liên quan chính | API liên quan | Test đã chạy | Kết quả |
|---|---|---|---|---|---|
| S-21 — 3 SP | Nhật ký tạo/sửa/xóa mềm, ngày/giờ/nội dung/hạng mục đúng dự án; lọc ngày/hạng mục/đồng bộ; chi tiết và lịch sử; quyền kiểm tra tại server; giao diện mobile. Lưu trên thiết bị được phân biệt với lưu trên server. | `frontend/src/pages/SiteJournal.jsx`; `backend/src/services/journalService.js`; controller/model/routes `siteManagement*`; migration 017 | GET/POST `P/journals`; PUT/DELETE `P/journals/:id`; GET `P/journals/:id/history` | Backend PostgreSQL nhật ký/quyền; Sprint45 E2E tạo 20 bằng form thật, sửa, lọc, chi tiết; hồi quy site UI | **PASS** |
| S-22 — 2 SP | Một đầu ngày/dự án; nhân lực, thiết bị và thời tiết từ catalog PostgreSQL có thể cấu hình; đánh dấu mưa cả ngày; xem ngày/tuần, đối chiếu task trễ/CPM. Hai request đồng thời không tạo đầu ngày trùng. | `SiteJournal.jsx`; `journalService.js`; `siteManagementModel.js`; `017_sprint4_5.sql` | GET/PUT `P/journals/daily`; GET `P/journals/days`; PUT `P/journals/catalog`; catalog cũng trả trong GET nhật ký | PostgreSQL unique/concurrent daily header, catalog và mưa; hồi quy UI nhập đầu ngày | **PASS** |
| S-23 — 3 SP | Chọn nhiều ảnh/chụp ảnh; tối đa 20 ảnh/nhật ký, đủ yêu cầu 10; nén client <1 MiB, thumbnail; giữ byte gốc và EXIF thực; tải thumbnail trước, mở gốc khi xem lớn; trạng thái/chức năng retry; ảnh riêng kiểm tra membership. JPEG/PNG/WebP, tối đa 10 MiB và 40 MP. | `frontend/src/services/photoCompression.js`; `SiteJournal.jsx`; `backend/src/services/photoService.js`; `journalService.js`; migration 017 | POST `P/photos`; GET `P/photos/:id/thumbnail`; GET `P/photos/:id/original`; manifest ảnh trong nhật ký | PostgreSQL 10 ảnh, upload đồng thời/replay/checksum; EXIF camera fixture và đối chiếu byte; E2E 30 ảnh gốc >1 MiB, bản nén <1 MiB, mất phản hồi/retry | **PASS** |
| S-24 — 2 SP | Kỹ sư khóa ngày đã qua theo múi giờ Việt Nam; khóa chặn sửa/xóa/ảnh/sync/resolve. Ban quản lý mở khóa cần lý do, audit người/thời điểm/lý do; lịch sử giữ nguyên. Có transaction/row lock và guard PostgreSQL cho liên kết ảnh. | `journalService.js`; `siteManagementModel.js`; `SiteJournal.jsx`; migration 017 | PUT `P/journals/lock`; các API ghi nhật ký/ảnh/sync/resolve kiểm tra khóa | Direct API sau khóa, SQL photo link sau khóa; kỹ sư mở khóa bị 403; thiếu lý do bị 400; lý do hợp lệ lưu audit | **PASS** |
| S-25 — 3 SP | Đội theo dự án và thành viên dự án; tạo/sửa task bằng TaskForm hiện có; giao/đổi đội; lọc/xem chi tiết; >3 task giao nhau cảnh báo nhưng vẫn lưu; đội cũ mất quyền, lịch sử điều chuyển giữ lại. | `frontend/src/pages/FieldAssignments.jsx`; `backend/src/services/projectOperationsService.js`; `projectOperationsModel.js`; controller/routes `projectOperations*` | GET/POST `P/teams`; GET `P/participants`; GET `P/assignments`; PUT `P/assignments/:taskId`; GET chi tiết; API task/dependency hiện có | PostgreSQL team scope/overload/reassignment/history; E2E tạo/sửa task, tạo đội, gán đội, lọc; hồi quy operations | **PASS** |
| S-26 — 3 SP | Đội trưởng chỉ xem task đội mình, sắp ngày bắt đầu; dấu Găng; báo khối lượng tăng thêm/ngày; lưu người/giờ/task/đội; lũy kế và cảnh báo vượt kế hoạch vẫn lưu; giữ actual progress Sprint 3. Nút mobile ≥44 px, bảng cuộn trong container. | `FieldAssignments.jsx`; `projectOperationsService.js`; `projectOperationsModel.js`; `DashboardLayout.jsx`; `ModuleInsights.jsx` | POST `P/assignments/:taskId/progress`; PUT `P/assignments/:taskId/quantity`; GET list/detail | PostgreSQL quyền đội, quantity/replay/overrun; E2E viewport 390 px báo 12/10 m³, dấu Găng, xem người/đội; hồi quy actual progress/CPM/Gantt | **PASS** |
| S-27 — 2 SP | Manifest standalone, icon 192/512, shell cache, hash phiên bản; gợi ý cài/cập nhật; worker mới chờ thao tác rõ ràng, không tự reload giữa form; không cache API/private data trong CacheStorage; giữ IndexedDB khi cập nhật. | `frontend/public/manifest.webmanifest`; `journal-sw.js`; `icons/*`; `frontend/src/components/PwaUpdate.jsx`; `App.jsx`; `vite.config.js`; `scripts/generate-pwa-icons.cjs` | File tĩnh `/manifest.webmanifest`, `/journal-sw.js`, `/icons/*`; không thêm API nghiệp vụ | Production E2E icon/cache/update/quota; warm shell 225 ms; browser restart mở `/site-journal` offline 564,8 ms; worker development case riêng PASS | **BLOCKED**: chưa có lượt Add to Home Screen và standalone trên điện thoại thật; không tính manifest/emulation là bằng chứng cài thực |
| S-28 — 2 SP | Thêm ngay tài khoản có sẵn; lời mời email mới với token ngẫu nhiên/hash/7 ngày/một lần, thiết lập mật khẩu lần đầu; pending/cancel/renew; đổi role/gỡ member; chặn gỡ/hạ quyền quản lý cuối; audit giữ; mọi API scoped theo membership. `worker` hiển thị Đội trưởng và không được nâng quyền quản lý. | `Members.jsx`; `AcceptInvitation.jsx`; `Login.jsx`; `Register.jsx`; `DashboardLayout.jsx`; `authService.js`; `authController.js`; `userModel.js`; `projectOperations*`; migration 017 | POST/PATCH/DELETE `P/members[/:userId]`; DELETE `P/invitations/:id`; POST renew; POST `/auth/register` với invitation token; login/me | E2E lời mời/first password/tài khoản có sẵn/gỡ/last manager; backend cancel/expiry/plain register không chiếm lời mời; project isolation kể cả global admin outsider | **PASS** |

Lời mời được UI trả thành **liên kết để sao chép/chia sẻ**; chưa cấu hình gửi email tự động. Chữ “Gửi lời mời” tạo lời mời và liên kết thật; báo cáo không tuyên bố email đã được gửi.

## 2. Sprint 5 — 20 SP

| Story | Chức năng triển khai | File liên quan chính | API liên quan | Test đã chạy | Kết quả |
|---|---|---|---|---|---|
| S-29 — 5 SP | IndexedDB dùng chung page/SW; journal UUID và Blob gốc/bản nén/metadata lưu nguyên tử; draft tồn tại qua reload và đóng/mở browser; cache project/user để ghi offline; estimate/quota/persistent storage; thiếu quota giữ form. | `frontend/public/journal-queue.js`; `frontend/src/services/journalOffline.js`; `SiteJournal.jsx`; `photoCompression.js` | Đọc online `P/journals`, `/auth/me`; local không gọi API để đếm draft | E2E 20 journal/30 ảnh offline, reload + full browser restart, mở start URL offline; quota injection giữ form; update giữ hàng đợi; logout/đổi tài khoản | **PASS** |
| S-30 — 5 SP | Gửi journal theo thứ tự trước ảnh; lease bền cho nhiều tab/SW; retry tối đa 5 lần với backoff 2–60 giây, lỗi dữ liệu không cản mục sau; unique UUID/operation ledger PostgreSQL; server lưu nhưng client mất phản hồi vẫn không trùng. Sync event qua SW khi hỗ trợ, fallback online/open + vòng foreground; kiểm tra tài khoản trước mỗi lần gửi. | `journal-queue.js`; `journal-sw.js`; `journalOffline.js`; `journalService.js`; migration 017 | POST `P/journals/sync`; POST/PUT nhật ký; `/auth/me`; `expected_user_id` ở các request sync/ảnh | Concurrent 8 send cùng operation chỉ 1 bản; lost response/replay; invalid entry tiếp tục; 20+30 sync về 0; account change không gửi nhầm | **BLOCKED**: các kết quả trên PASS; chưa kiểm chứng OS/browser tự đánh thức SW và hoàn tất sync khi ứng dụng đã đóng. Test mở lại chỉ chứng minh fallback, không chứng minh sync lúc đóng |
| S-31 — 2 SP | Thanh trạng thái đầu trang, journal/photo pending tính từ IndexedDB; đang/chưa/lỗi/đã sync; lý do và retry; thời điểm thành công cuối; hoạt động offline. Ảnh của bản xung đột không chọn lưu archive riêng, không làm kẹt pending count. | `SiteJournal.jsx`; `journal-queue.js`; `JournalSync.css` | Không phụ thuộc API server để lấy pending count | E2E offline hiển thị 20/30, lỗi từng mục, retry và queue 0; conflict archive và acknowledge resolution từ người khác | **PASS** |
| S-32 — 3 SP | Revision tăng, lịch sử immutable tại DB; so sánh từ base snapshot; gộp trường độc lập an toàn; conflict cùng trường trả 409 nhưng giữ base/server/incoming; UI hai cột chọn bản; không chọn vẫn còn history. Resolve phải dùng revision mới nhất đã xem. Ảnh local của bản bỏ vẫn tải gốc được. | `journalService.js`; migration 017; `SiteJournal.jsx` (`JournalHistory`); `journal-queue.js` | GET `P/journals/:id/history`; POST `P/journals/conflicts/:id/resolve`; PUT nhật ký với revision/operation UUID | PostgreSQL same-field conflict/replay/merge/stale resolution/fresh resolution/immutable history; E2E compare/select; resolve bởi người khác rồi release ảnh; locked resolve bị chặn | **PASS** |
| S-33 — 3 SP | Hàng đợi ảnh riêng, một upload tại một thời điểm, journal mới được ưu tiên trước ảnh tiếp theo; 30 ảnh; manifest pending cho người khác xem; retry nguyên request an toàn; SHA-256 byte gốc; BLOB lưu transaction nên không có file `.partial`; UUID replay không tạo ảnh trùng. | `journal-queue.js`; `photoCompression.js`; `photoService.js`; `journalService.js`; `siteManagementModel.js`; migration 017 | POST `P/photos` cùng journal/item/client UUID/checksum/display data; GET nhật ký trả placeholder và thumbnail/original khi xong | E2E 30 ảnh >1 MiB, interrupted/lost-response upload, placeholder, thêm journal khi ảnh đang gửi, server byte count; PostgreSQL 10 concurrent/replay/checksum/private access | **PASS** |
| S-34 — 2 SP | Playwright production + PostgreSQL thật: offline 20 journal kèm 30 ảnh → IDB → reload/browser restart → online → đúng 20 → replay không trùng → pending 0; JSON/ảnh minh chứng; job CI PG17/Node24/Chromium + artifacts. | `frontend/tests/sprint45.real.spec.js`; `sprint45.teardown.js`; `playwright.sprint45.config.js`; `backend/scripts/operations-e2e-server.cjs`; `.github/workflows/ci.yml` | Test-only fixture/proof/shutdown trên server E2E riêng; nghiệp vụ dùng API thật | Ca chính 76,756 s; thời gian kịch bản đo nội bộ 69,548 s; cả 9 ca 120,668 s; không flaky, không retry test | **BLOCKED**: local PASS dưới 3 phút; workflow chưa chạy trên GitHub vì không push/merge. Chưa kết luận thời gian runner CI từ thời gian local |

## 3. Kết quả kiểm thử và bằng chứng

### Tổng hợp các lượt chạy cuối

| Nhóm | Tổng | PASS | FAIL | SKIP | Bằng chứng / phạm vi |
|---|---:|---:|---:|---:|---|
| Backend Jest, 23 suite | 233 | 233 | 0 | 0 | [backend-test-results.json](backend-test-results.json); lượt cuối 40,130 s |
| Frontend unit | 17 | 17 | 0 | 0 | `npm run test:unit`; Gantt/view-model/project calendar, kết quả terminal |
| Playwright UI regression | 33 | 32 | 0 | 1 | [ui-regression-results.json](ui-regression-results.json); 82,286 s; 1 case worker dev cần opt-in |
| Playwright real regression | 12 | 12 | 0 | 0 | [real-regression-results.json](real-regression-results.json); 41,732 s; operations/site/projects visual/Sprint3 thực |
| Playwright Sprint45 | 9 | 9 | 0 | 0 | [playwright-results.json](playwright-results.json); 120,668 s |
| Playwright worker dev, lượt riêng | 1 | 1 | 0 | 0 | [worker-development-results.json](worker-development-results.json); 6,522 s; chạy chính case opt-in bị skip ở suite UI |
| **Frontend tổng các lượt gọi trên** | **72** | **71** | **0** | **1** | Số lượt thực thi, không phải 72 test unique; case skip vẫn giữ nguyên SKIP trong lượt UI, sau đó PASS ở lượt riêng |
| Backup/restore native T46/T47 | 4 | 4 | 0 | 0 | [backup-regression-results.json](backup-regression-results.json), [output](backup-regression-output.txt) |
| Backend/frontend lint | 2 lệnh | 2 | 0 | 0 | `npm run lint` trong mỗi package |
| Production build | 1 lệnh | 1 | 0 | 0 | `npm run build`; cảnh báo bundle lớn, không có build error |

Không cộng lint/build vào số test. Các kiểm thử PostgreSQL là **tập con của 233**, không cộng thêm lần nữa: Sprint2 28, projectOperations 9, siteManagement 10, Sprint3 integration 4, Sprint45 10 và demo-admin 4 = **65 ca trong 6 file tích hợp**, gồm **63 ca dùng PostgreSQL thật** và 2 ca kiểm tra guard trước kết nối; không skip. Lệnh demo-admin được kiểm tra từ chối DB gốc/tên không an toàn/email thiếu, nâng role đúng, giữ password/project role, lặp an toàn và không tạo account nếu email chưa tồn tại. `migrations.test.js` có 20 ca; ca roundtrip/guard 017 trên PostgreSQL thật nằm trong Sprint45. Database/schema test riêng được dọn sau kiểm thử, không reset database người dùng.

Các trường hợp đã chạy gồm authentication/project/team authorization, last-manager, invitation, catalog/daily uniqueness, locks, concurrency/idempotency, immutable versions/merge/conflict, photo integrity/EXIF, quota, update và account isolation. Regression Sprint1–3 gồm work-item tree, task/dependency cycle, CPM, Gantt, actual progress, calendar, baseline, milestone và alerts. E2E chính và giao việc kiểm tra `pageerror` rỗng; các lỗi network chủ động gây ra trong kiểm thử offline/503 không bị tính thành lỗi JavaScript ứng dụng. Không tuyên bố đã audit toàn bộ browser console trên mọi thiết bị.

### Đo trên dữ liệu thật trong kịch bản offline

[offline-postgres-proof.json](evidence/offline-postgres-proof.json) lưu 20 journal ID/UUID/revision đọc từ PostgreSQL và kết quả sau replay:

- Đúng **20 nhật ký**, **30 ảnh**, **1 đầu ngày**; `duplicateReplay`, `queueEmpty`, `browserRestartSurvival`, `offlinePwaStart` đều `true`.
- Mỗi ảnh gốc **2.826.729 byte**, bản hiển thị client **945.508 byte** (<1 MiB và <1.000.000 byte); 30 ảnh gốc tổng **84.801.870 byte**, bằng số byte gốc lưu server.
- Thumbnail lớn nhất **30.725 byte**. EXIF/GPS được kiểm tra ở ca camera fixture riêng; ảnh không chứa EXIF nhận giá trị thiếu, không tự tạo tọa độ/thời gian.
- Shell mở offline sau browser restart **564,8 ms**. Ca riêng warm shell **225 ms**, giữ form sau quota và giữ queue sau cập nhật: [pwa-quota-update-proof.json](evidence/pwa-quota-update-proof.json). Đây là số đo Chrome local với cache nóng, không phải cam kết mọi thiết bị.

Ảnh QA: [offline mobile](evidence/offline-20-mobile.png), [đồng bộ mobile](evidence/synced-20-mobile.png), [đội trưởng báo 12/10 m³](evidence/worker-report-mobile.png), Gantt tại [375 px](evidence/schedule-375.png), [768 px](evidence/schedule-768.png), [1366 px](evidence/schedule-1366.png), [1600 px](evidence/schedule-1600.png). Hai ảnh journal được cắt 1.300 px đầu trang từ screenshot đầy đủ để giữ báo cáo nhẹ; số lượng thực lấy từ JSON/PostgreSQL, không suy ra từ phần ảnh đã cắt. Nhãn lỗi “Test transport unavailable” ở ảnh offline là lỗi 503 chủ động dùng để giữ queue pending trong phép kiểm thử, không phải dữ liệu nghiệp vụ mock.

Browser restart dùng Chrome profile bền ở thư mục tạm ngắn; IndexedDB và shell cache thật. Test tắt transport của project trong server fixture để SW không lén đồng bộ trong giai đoạn offline/đóng browser, rồi mở lại transport trước sync. Các request nghiệp vụ, PostgreSQL, nén và upload thật; endpoint fixture chỉ tồn tại ở server E2E. Đây không phải chứng minh Background Sync tự chạy khi app đóng.

### Backup/restore và các phép kiểm chứng chưa thực hiện

Đã gọi **nguyên script T46/T47 chưa commit trong worktree gốc**, qua Git Bash + PostgreSQL native, trên hai database tạm riêng. Bốn nhóm PASS: dump custom hợp lệ/tạo nguyên tử không còn `.partial`; rotation ba bản còn hai; restore/đối chiếu số bản ghi 14 bảng và byte ảnh gốc; chặn target không rỗng và chặn source làm target. Dữ liệu test/dump tạm đã dọn, không đưa dump vào Git.

**Chưa thực hiện**, không tính PASS:

1. **S-27:** cài lên Home Screen và chạy standalone trên điện thoại Android/iOS thật. Cần thiết bị và origin an toàn hỗ trợ PWA; thao tác QA mô tả ở mục 4. Chrome mobile emulation không thay thế bước này.
2. **S-30:** tự động đồng bộ do OS/browser đánh thức service worker khi ứng dụng đã đóng. Cần lượt thử trên nền tảng thực hỗ trợ Background Sync; fallback khi mở lại đã PASS. UI chỉ báo API hỗ trợ, không báo đã chứng minh OS sẽ chạy đúng thời điểm.
3. **S-34:** CI GitHub/runner Linux và thời gian thực tế trên runner. Workflow đã cấu hình, chưa push nên chưa có run URL/log từ xa. Mốc <3 phút đã đạt local cho suite Sprint45; 10 phút timeout job gồm setup và regression, không phải kết quả thời gian S-34.
4. Docker image/Compose/backup mode Docker: Docker Desktop daemon không chạy (`dockerDesktopLinuxEngine` không tồn tại). Đã dùng PostgreSQL 17 local theo yêu cầu; chưa tính Docker PASS.
5. Nâng cấp **database cũ** bị migration-history guard chặn với `Applied migration has changed: 014_create_project_invitations.sql`. Không sửa file 014/checksum hoặc dữ liệu để vượt guard; đã dùng database demo riêng. Cần đối chiếu lịch sử DB với đúng bản 014 từng được triển khai/backup trước khi nâng cấp DB đó.

## 4. Hướng dẫn kiểm thử thủ công

### Chuẩn bị và vai trò

Mở **http://127.0.0.1:4174/register**; tự đặt email/mật khẩu hợp lệ. Tài khoản mới có `system_role=user`, chưa tham gia dự án; giao diện đăng ký không có bộ chọn role. Trong terminal tại server chạy lệnh sau, thay email bằng email vừa đăng ký:

```powershell
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\backend'
npm run admin:bootstrap -- --database=construction_sprint45_demo --email=EMAIL_VUA_DANG_KY
```

CLI yêu cầu nhập chính xác `GRANT_SUPER_ADMIN:construction_sprint45_demo:EMAIL_VUA_DANG_KY` trước khi thay đổi. Chỉ cấp `system_role=super_admin` cho tài khoản đã tồn tại, giữ mật khẩu và project memberships, ghi audit, không tạo tài khoản/password. Refresh hoặc đăng nhập lại, vào `/projects` bấm **Tạo dự án**: tên `Demo Sprint 4–5`, địa điểm `Công trường thử`, ngày bắt đầu `2026-10-01`. Ghi ID dự án thành `P_ID`; cấp sáu vai trò dự án trên trang **Quản trị hệ thống** theo báo cáo mới.

Dùng các browser profile/cửa sổ riêng để đăng nhập Ban quản lý, Chỉ huy trưởng, Kỹ sư A, Kỹ sư B, Đội trưởng A/B. Chia sẻ cookie giữa các tab thường không tạo hai tài khoản độc lập. Tạo hạng mục lá **Móng demo** trong `/work-items?projectId=P_ID` trước khi tạo task/journal. Mật khẩu không ghi vào screenshot/log/report.

Role dự án quyết định quyền: `admin` = Ban quản lý; `project_manager` = Chỉ huy trưởng; `engineer` = Kỹ sư giám sát; `worker` = Đội trưởng; `viewer` = Chủ đầu tư; `accountant` = Kế toán; alias `manager` được giữ tương thích. `users.role_id` cũ không cấp quyền quản trị. Chỉ `system_role=super_admin` có quyền toàn hệ thống; tài khoản thường phải có membership phù hợp. Đội trưởng sử dụng giao việc đội, không được cấp Gantt/quản trị.

### Demo đầy đủ theo chuỗi nghiệp vụ

| Bước / vai trò | URL, nút và dữ liệu | Kết quả chính xác cần thấy | Bằng chứng nên chụp |
|---|---|---|---|
| 1. Ban quản lý — mời/thêm thành viên | `/members?projectId=P_ID` → **Mời thành viên** → email mới của chỉ huy/kỹ sư/đội trưởng → chọn **Vai trò trong dự án** → **Gửi lời mời**. Sao chép **Liên kết lời mời**. Người mới mở link trên profile riêng, nhập **Họ và tên**, **Mật khẩu mới**, bấm **Thiết lập và đăng nhập**. Lặp cho đủ vai trò; với email account đã đăng ký thì thêm trực tiếp. | Email mới xuất hiện ở **Lời mời chờ xử lý**, sau accept chuyển thành member; `/projects` của người được mời thấy dự án; role label đúng. Account có sẵn thấy dự án sau reload. | Bảng member/role và project của account được mời; che token trong URL |
| 2. Chỉ huy trưởng — task/đội/giao việc | `/field-assignments?projectId=P_ID` → **＋ Tạo công việc**; chọn **Móng demo**, tên `Đổ bê tông móng`, ngày bắt đầu/kết thúc phù hợp → **Lưu công việc**. **Sửa việc** sửa tên. **＋ Tạo đội thi công**, tên `Đội A`, chọn Đội trưởng A → **Tạo đội**; tạo Đội B tương tự. Task → **Gán đội** A → **Lưu**; **Kế hoạch**: `10`, `m³` → **Lưu**. Tạo thêm 3 task cùng khoảng thời gian và gán A. | Task/đội là dữ liệu API thật; 4 task overlap cảnh báo quá tải nhưng task thứ tư vẫn được giao; bộ lọc tên/đội/tuần/trạng thái làm thay đổi danh sách. Task đường găng có dấu **Găng** sau tính lịch. | Cảnh báo quá tải, task gán đội, dấu Găng |
| 3. Đội trưởng A — báo khối lượng | Profile Đội trưởng A mở `/field-assignments?projectId=P_ID`, viewport 390 px hoặc điện thoại. Task → **Báo khối lượng**, chọn ngày, khối lượng `12`, ghi chú `Phát sinh thực tế` → **Gửi báo cáo**. | Chỉ thấy việc đội A; danh sách theo ngày bắt đầu. Có cảnh báo vượt nhưng báo cáo lưu; dòng task **12 / 10 m³**. Chỉ huy bấm **Chi tiết** thấy người báo, Đội A, ngày/giờ, 12 m³. Bảng cuộn ngang trong vùng bảng, nút báo ≥44 px. | Mobile 12/10 + cảnh báo; chi tiết báo cáo của chỉ huy |
| 4. Chỉ huy trưởng — đổi đội | Task → **Đổi đội** → chọn B → **Lưu**; **Chi tiết** → **Lịch sử phân công**. Reload profile A/B. | Lịch sử A → B có người/thời điểm; A không còn thấy task, B thấy; gọi detail/progress task bằng account A bị 403. Báo cáo cũ vẫn tồn tại. | Lịch sử và danh sách A/B |
| 5. Ban quản lý/Kỹ sư — cấu hình/đầu ngày | Ban quản lý mở `/site-journal?projectId=P_ID` → **Cấu hình thời tiết / thiết bị**: weather code `heavy_rain`, tên `Mưa lớn cả ngày`, **Mưa cả ngày: Có**, **Sử dụng: Có** → lưu; tạo equipment `crane_demo`, `Cẩu demo`. Kỹ sư chọn ngày đã qua **D1** (ví dụ 2026-10-05 nếu ngày hiện tại vẫn sau đó), **Nhập thông tin đầu ngày**: nhân lực `8`, thời tiết vừa cấu hình, thiết bị cẩu → **Lưu thông tin đầu ngày**. | Catalog vừa tạo xuất hiện trong select/checkbox; một đầu ngày duy nhất cho D1/dự án; dấu mưa cả ngày. Khu xem tuần có thông tin và đối chiếu task trễ; không diễn giải mưa tự động là nguyên nhân trễ. | Đầu ngày/mưa/catalog, bảng tuần |
| 6. Kỹ sư — nhật ký/10 ảnh | **＋ Ghi nhật ký** → chọn **Móng demo**, D1, giờ `08:30`, nội dung `Thi công móng D1`, cùng thông tin đầu ngày; **Chọn nhiều ảnh** chọn 10 JPEG/PNG/WebP hợp lệ có ảnh >1 MB → **Lưu nhật ký**. Có thể thử **Chụp ảnh hiện trường** trên điện thoại. | Form nén xong trước lưu. Thông báo lưu bền trên thiết bị; nhật ký gửi trước/ảnh sau. Cuối cùng pending 0, nhật ký nằm trong danh sách D1; ảnh hiển thị thumbnail, bấm mở ảnh gốc. Lọc D1/hạng mục ra đúng bản. Thiếu hạng mục/nội dung bị chặn. | Danh sách lọc, thumbnail; Network kích thước display và original; metadata ảnh thật có EXIF |
| 7. Kỹ sư/Ban quản lý — khóa/mở | Kỹ sư **Khóa / mở sổ** → D1 → **Khóa sổ** → lưu. Thử sửa/xóa qua Network request trực tiếp và upload/sync ảnh cho D1. Kỹ sư thử mở khóa; Ban quản lý thử mở với lý do rỗng, sau đó `Bổ sung biên bản`. | D1 có dấu khóa; ghi vào D1 bị từ chối tại API. Kỹ sư không được mở (403); quản lý thiếu lý do bị 400; lý do hợp lệ mở khóa và audit giữ người/giờ/lý do. History không mất. Đóng/mở form không vượt được server guard. | Biểu tượng khóa + API status; `/audit-logs?projectId=P_ID` sau mở khóa |
| 8. Kỹ sư — offline 20 journal/30 ảnh | Khi còn online mở nhật ký một lần để cache project/user. Chọn ngày **D2 khác D1, chưa khóa**, mở Chrome DevTools Network → **Offline**. Tạo `OFFLINE-01`…`OFFLINE-20`; mỗi journal ≥1 ảnh, thêm ảnh để tổng 30. Hạng mục Móng demo, D2, giờ hợp lệ, cùng weather/equipment/manpower để không tạo conflict đầu ngày. **Lưu nhật ký** sau mỗi mục. Reload; đóng rồi mở browser cùng profile, vẫn giữ offline, mở `/site-journal`. | Local count **20 nhật ký**, **30 ảnh**; bản ghi trên thiết bị không biến mất. Start URL tự chọn project cuối đã lưu. IndexedDB có UUID/job/Blob gốc. Không đánh đồng với lưu server. Network failure có thể mang nhãn lỗi chờ retry, kèm lý do, nhưng không mất draft. | Thanh count 20/30 trước và sau reopen; Application → IndexedDB |
| 9. Kỹ sư — online/sync/replay | Bật Network **No throttling/Online**; giữ đúng account. Nếu một mục đã hết retry do offline kéo dài, bấm **Thử đồng bộ lại**. Chờ theo trạng thái/count, không dùng sleep cố định. Lọc D2; lấy request `/journals/sync` đã thành công từ Network rồi gửi lại **đúng body và operation_uuid/client_uuid cũ**, bằng cùng session. | Queue về **0 nhật ký / 0 ảnh**, có thời điểm đồng bộ cuối. D2 có đúng 20 journal (so với số trước kịch bản), 30 ảnh. Replay trả kết quả đã xử lý; số journal/photo không tăng. Không bấm tạo form lần mới để thử replay vì form mới có UUID mới. | Count 0; Network replay; truy vấn read-only PostgreSQL bên dưới |
| 10. Hai Kỹ sư — xung đột/merge | A và B mở **Sửa** cùng một journal từ cùng revision. A sửa nội dung `Bản A`, lưu và sync trước; B lưu `Bản B` từ form cũ. B mở **Xem … lỗi đồng bộ** → **So sánh hai bản** (hoặc **Chi tiết** trên record), xem hai cột, chọn **Giữ bản gửi đến** hoặc **Giữ bản máy chủ**. Nếu người khác giải quyết trước, bấm **Áp dụng lựa chọn đã xử lý**. Thử lần khác A đổi nội dung, B chỉ đổi giờ từ cùng base. | Cùng trường: 409/conflict, không âm thầm overwrite; UI hai cột + history. Chọn bản tạo revision mới, bản bỏ vẫn còn conflict history. Ảnh local của bản bỏ ở mục lưu trữ, tải gốc được và không kẹt count. Trường độc lập: tự merge, giữ cả nội dung và giờ. Resolve đã cũ yêu cầu tải lại revision mới. | Hai cột, history trước/sau; count 0 hoặc archive gốc |

Trong bước 8–9 không chọn ngày đã khóa ở bước 7: lỗi khóa là từ chối nghiệp vụ đúng, không phải lỗi sync. Có thể để D1 khóa và dùng D2 để chứng minh cả hai hành vi trong cùng demo.

Truy vấn read-only để đối chiếu bước 9 (trong **database demo**, thay project/day thực; kiểm tra chênh lệch trước/sau nếu D2 đã có dữ liệu):

```sql
SELECT count(*) AS journals, count(DISTINCT client_uuid) AS distinct_uuids
FROM site_journals
WHERE project_id = <P_ID> AND day = DATE '<D2>' AND deleted_at IS NULL;

SELECT id, client_uuid, revision, content
FROM site_journals
WHERE project_id = <P_ID> AND day = DATE '<D2>' AND deleted_at IS NULL
ORDER BY id;

SELECT count(*) AS photos, count(DISTINCT p.client_uuid) AS distinct_uuids,
       sum(octet_length(p.original)) AS original_bytes
FROM site_photos p
WHERE p.project_id = <P_ID> AND EXISTS (
    SELECT 1 FROM journal_photos jp
    JOIN site_journals j ON j.id = jp.journal_id
    WHERE jp.photo_id = p.id AND j.project_id = <P_ID>
      AND j.day = DATE '<D2>' AND j.deleted_at IS NULL
);
```

### Các kịch bản bổ sung

| Vai trò / URL | Thao tác, dữ liệu | Kết quả chính xác / ảnh bằng chứng |
|---|---|---|
| Ban quản lý và account bị gỡ; `/members?projectId=P_ID` | Menu **Thao tác với …** → **Gỡ thành viên …** → **Xác nhận**; account bị gỡ reload và gọi API project cũ. Thử tự gỡ Ban quản lý cuối ở dự án chỉ có mình. | Member bị gỡ không đọc/ghi API (403), audit cũ còn; gỡ người quản lý cuối báo lỗi **cuối cùng**. Chụp UI error và API status. |
| Người ngoài dự án, kể cả global admin | Đăng nhập account không có membership P_ID; thử GET journal/photo và POST sync. | 403, không thấy dữ liệu/ảnh riêng; lưu Network status, không cần mở file riêng. |
| Kỹ sư; `/site-journal?projectId=P_ID` | Tạo draft offline, logout rồi đăng nhập user khác; sau đó login lại đúng user. | Draft gốc giữ trong IDB; account khác không auto-sync draft của người trước; đúng account mới tiếp tục xử lý. Chụp count và Network, không chụp token/cookie. |
| Kỹ sư; quota/update | Thử quota trên profile test hoặc chạy ca tự động thứ 7. Mở form nhật ký, để worker phiên bản mới ở trạng thái waiting; chưa chọn cập nhật; đóng/lưu form rồi bấm cập nhật. | Quota error giữ nội dung form; không ghi “đã lưu” khi transaction thất bại. Worker không tự reload form; cập nhật rõ ràng giữ draft/ảnh đã lưu. Chụp form error và waiting/update state. |
| Kỹ sư; mạng yếu/ảnh | DevTools Slow network, mất kết nối giữa upload rồi online/retry; người khác mở journal lúc ảnh chưa xong; tạo thêm journal trong lúc queue ảnh chạy. | Placeholder **Ảnh đang chờ**, không broken image; journal mới lên trước khi hết mọi ảnh; retry không nhân đôi và gốc/checksum còn nguyên. Chụp placeholder/Network/count. |
| Kỹ sư; PWA điện thoại — **còn BLOCKED** | Dùng điện thoại thật và origin an toàn truy cập được, mở online/cache một lần, **Cài lên màn hình chính** hoặc menu hệ điều hành. Mở icon vừa cài; mở offline; thử update đang có draft. | Cần ghi OS/browser/version, ảnh icon Home Screen và cửa sổ standalone, `display-mode: standalone` nếu kiểm tra được; mở dự án cuối offline, draft giữ. Chưa có bằng chứng này trong phiên hiện tại. |
| Kỹ sư; native Background Sync — **còn BLOCKED** | Trên nền tảng thật có SyncManager, tạo draft offline; đóng toàn bộ cửa sổ app; bật mạng nhưng chưa mở app; kiểm tra server từ session khác. Sau đó mở app nếu nền tảng không hỗ trợ/không đánh thức. | Chỉ đánh dấu native PASS khi server nhận đúng UUID trước khi app mở lại. Nếu chỉ sync sau reopen, ghi fallback PASS và native chưa đạt/không hỗ trợ; không gộp hai kết luận. |
| CI — **còn BLOCKED** | Sau review và thao tác Git do người dùng quyết định, mở workflow run/PR checks của branch. | Job Sprint45/Backend có log/artifact, 0 failure; đo riêng test Sprint45 <180 s, tách khỏi setup. Ghi URL run thực; hiện chưa có URL. |

## 5. Git, migration và chạy ứng dụng

### Bảo toàn thay đổi sẵn có

- Worktree gốc: `D:\Project\construction-management-new`, vẫn ở **feature/T46-T47**, HEAD `f6be4a2`.
- Worktree triển khai: **`D:\Project\construction-management-new\.worktrees\sprint4-5`**, branch **feature/sprint4-5** từ `main` / `f6be4a2`.
- Thay đổi chưa commit ở worktree gốc (`.gitignore`, `README.md`, `docker-compose.staging.yml`, scripts/docs T46/T47) được giữ nguyên; `.worktrees/` xuất hiện untracked vì checkout mới nằm trong workspace.
- Không reset/stash/xóa code người dùng; không commit, push, merge hay force-push. Các thay đổi Sprint45 hiện ở working tree để review.
- `git diff --check` đạt; migration **001–016 không đổi**; screenshot Sprint3 gốc không đổi. Screenshot regression mới nằm ở `docs/sprint4-5/evidence`.
- [FILES_CHANGED.txt](FILES_CHANGED.txt) là danh sách đầy đủ file mới/sửa, sinh từ `git ls-files --modified --others --exclude-standard` tại bàn giao. [git-status.txt](git-status.txt) ghi snapshot trạng thái ở worktree triển khai và gốc. `.env`, `node_modules`, `dist`, thư mục test tạm và dump không đưa vào Git.

### Migration mới và tính toàn vẹn

Chỉ thêm **`backend/src/migrations/017_sprint4_5.sql`** và **`017_sprint4_5.down.sql`**. Tái sử dụng `site_journals`, `journal_daily_info`, `site_photos`, project_members/teams/task/progress và audit cũ. Bổ sung catalog/config, immutable journal versions/write ledger/conflict snapshots, photo-upload manifest và invitation token/expiry; không tạo kho ảnh thứ hai. Phiên bản cũ được bootstrap snapshot; catalog mặc định được seed trong DB và người quản lý sửa được.

Up/down đã chạy trên schema PostgreSQL test riêng. **Down từ chối nếu có dữ liệu mới cần giữ** (versions/writes/conflicts/upload manifest/token, trường đầu ngày mới hoặc catalog đã thay đổi), thay vì xóa mất dữ liệu nghiệp vụ. Không chạy rollback tùy tiện trên DB người dùng. Roundtrip schema rỗng PASS, rollback có dữ liệu bị guard chặn đúng.

DB đang cấu hình ở `.env` ban đầu có checksum history lệch 014; `migrate:status` bị chặn trước khi áp dụng 017. Không “sửa checksum cho khớp”. Cách xử lý cần thiết: đối chiếu file 014 tại lần deploy thực với bảng migration history và backup, khôi phục baseline hợp lệ rồi đánh giá migration bổ sung; thực hiện sau review trên bản sao DB. **Demo riêng đã áp dụng 001–017 thành công**, không phụ thuộc nâng cấp DB cũ.

### Chạy demo local

Các server đã được giữ chạy tại bàn giao. Nếu cần khởi động lại, dùng **hai terminal**, không chạy song song hai backend cùng port:

```powershell
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\backend'
$env:PORT = '3000'
npm run demo:sprint45
```

Script đọc cấu hình PostgreSQL của `.env` local, tạo/migrate/seed roles **chỉ DB demo riêng**, không reset dữ liệu, không sửa `.env`. DB account cần quyền tạo DB lần đầu. `SPRINT45_DEMO_DB` có thể chọn tên riêng khác; script chặn trùng `DB_NAME` ban đầu. Khi cấp quyền, truyền chính xác tên đó vào `admin:bootstrap --database=...`. CLI duy nhất hiện hành là `backend/scripts/admin-bootstrap.cjs`; không có API tự cấp Super Admin. Demo đã áp dụng thêm migration 018 theo báo cáo mới.

```powershell
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\frontend'
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

- App/login: **http://127.0.0.1:4174/login**.
- Register: **http://127.0.0.1:4174/register**.
- Project: **http://127.0.0.1:4174/projects**.
- API: **http://127.0.0.1:3000/**; frontend proxy chuyển `/auth` và `/projects` về backend, session cookie cùng origin frontend.
- Kiểm tra HTTP cuối: login/manifest/icon 192/icon 512 đều 200; `/auth/me` chưa login là **401** đúng. Manifest `display=standalone`, `start_url=/site-journal`.
- Development dùng `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`; dùng production preview ở trên để thử shell offline/PWA. Dùng nhất quán một origin/profile để không tách IndexedDB/cookie/cache.

Ở checkout khác cần `npm ci` trong backend/frontend và `.env` hợp lệ trước; phiên này tái sử dụng node_modules local qua junction, không thay dependency/lockfile.

### Chạy lại kiểm thử

```powershell
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\backend'
npm run lint
npm run test:postgres -- --json --outputFile=../docs/sprint4-5/backend-test-results.json
```

`test:postgres` đọc connection local từ `.env` hoặc `SPRINT2_TEST_DATABASE_URL`, tạo schema UUID riêng, chạy toàn bộ suite rồi dọn schema của chính test. Không in password/URL có secret vào terminal. `npm test` thuần có thể skip các suite PG nếu chưa có biến môi trường; không dùng lượt đó để thay bằng chứng 233/233 PG-enabled.

```powershell
Set-Location 'D:\Project\construction-management-new\.worktrees\sprint4-5\frontend'
npm run lint
npm run test:unit
npm run build
npm run test:sprint45
npm run test:real-regression
npm run test:ui-regression
npm run test:worker-dev
```

Chạy Playwright lần lượt: các cấu hình dùng port 3031/4175 hoặc port test riêng và không chia sẻ server đang chạy. Windows dùng Chrome đã cài; CI Linux cài Chromium qua Playwright. E2E server tạo schema riêng, teardown đóng server/pool và dọn schema; app/demo port 3000/4174 không bị reset. Reporter tạo JSON tại thư mục báo cáo; trace/screenshot fail trong `frontend/test-results/*` local, CI upload artifacts.

### Hạn chế thực tế còn lại

- Ba Story BLOCKED ở các bằng chứng S-27/S-30/S-34 nêu rõ phía trên; chưa có xác nhận hoàn thành acceptance 14/14.
- Docker daemon và checksum DB cũ là hạn chế môi trường. Demo riêng cho phép kiểm thử chức năng trên localhost ngay.
- Mobile thật chưa thử camera, picker và standalone; E2E mobile là viewport 390 px. Trình duyệt có thể từ chối persistent storage; UI hiển thị kết quả và vẫn dùng IndexedDB, không hứa chống xóa dữ liệu của OS/người dùng.
- Offline cần mở project bằng đúng account online ít nhất một lần; project cache được scoped user, chưa có cache thì UI yêu cầu kết nối. Phiên đăng nhập hết hạn cần đăng nhập lại đúng account trước sync.
- Retry tự động có giới hạn; lỗi nghiệp vụ/khóa/thiếu quyền cần người có quyền xử lý rồi chọn retry; xung đột cần chọn bản. Upload bị đứt gửi lại nguyên ảnh an toàn, không triển khai chunk-resume mà backend không hỗ trợ.
- Production build có cảnh báo chunk chính khoảng 1,33 MB và asset nền login có sẵn khoảng 2,44 MB; mục tiêu <1 giây đã đạt với shell nóng local, chưa đo cold network/mobile thực.
- Không triển khai gửi mail invitation tự động; link thật có token một lần được quản lý chia sẻ thủ công.

**Điều kiện nghiệm thu còn thiếu:** chạy QA điện thoại S-27, thử native closed-app Background Sync S-30 trên nền tảng hỗ trợ (hoặc ghi nhận rõ nền tảng không hỗ trợ theo yêu cầu), và có CI run/log/artifacts S-34. Mọi phần chưa kiểm chứng được giữ BLOCKED, không báo PASS chỉ từ code.

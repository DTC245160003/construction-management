# XÂY DỰNG SỐ — Tích hợp Sprint 1–8 sau hợp nhất bản sao

Cập nhật **15/10/2026**, giờ Việt Nam. **Hợp nhất dữ liệu trên bản sao mới PASS**;
trạng thái phát hành tổng thể **PARTIAL**. Chủ hệ thống đã xác nhận
dtc245160003@ictu.edu.vn là Super Admin và chọn toàn bộ hồ sơ Sprint 4–5 làm chuẩn.
Nguồn gốc cũ được nhập bổ sung, không ghi đè hồ sơ đã chọn. Hai database nguồn
và hai bản sao đối chiếu cũ đều giữ nguyên, chưa nâng cấp/chuyển production.

Bản hợp nhất: **http://localhost:3082/login**, database **construction_merged_copy_1792015129032**.
**UAT Windows đã PASS do chủ hệ thống xác nhận**: đăng nhập Super Admin/tài khoản cũ,
đủ 3 dự án, dữ liệu và menu/phân quyền chính xác. Không suy ra danh sách từng
tài khoản khi chưa được liệt kê. Samsung đã cập nhật bản Sprint 1–8 qua Chrome tại localhost:4174 và xác minh
đúng database hợp nhất. Biểu tượng WebAPK cũ đã khôi phục sau reboot Samsung, được chủ máy xác nhận
và kiểm chứng standalone/worker/API. Chủ máy xác nhận UAT sử dụng chung Samsung ổn định, không phát hiện lỗi.
Những tiêu chí camera/offline/đồng bộ chưa có kết quả riêng vẫn giữ PARTIAL.

Worktree: D:/Project/construction-management-new/.worktrees/sprint4-5;
nhánh feature/sprint6-8-integration; HEAD 9bd97cc.
Không commit/push/merge, reset nguồn, đổi mật khẩu hoặc tự cấp quyền mới.

## 1. Kiến trúc thống nhất — DONE mã nguồn và hợp nhất trên bản sao

Một Express backend phục vụ React production build, API, session PostgreSQL,
Auth/RBAC, ảnh và PDF cùng origin. Sprint 1–8 dùng chung users, memberships,
projects, cây work_items và tasks trong database hợp nhất. Ảnh gốc/thumbnail
ở PostgreSQL BYTEA; PWA shell/queue theo tài khoản trong IndexedDB. Startup chỉ
kiểm tra schema, không migrate/seed/bootstrap. Không hardcode project ID hay
bỏ qua Authentication để sử dụng tài khoản cũ.

DATABASE_URL được ưu tiên, launcher chỉ đổi cấu hình trong process và xác minh
proof của bản sao; .env gốc giữ nguyên. 3080/3081 là bản sao đối chiếu lịch sử,
3082 là môi trường hợp nhất để nghiệm thu; chưa thay cấu hình database chính.
Main đã có ở HEAD; root worktree và các thay đổi chưa commit được giữ.
[Bảo toàn source](integration/source-preservation.json).

## 2. Đối chiếu toàn bộ Story — DONE rà soát / PARTIAL nghiệm thu phát hành

Nguồn nghiệm thu là workbook gốc, đã đọc đủ bảy sheet; không sửa file. Có
[Backlog với AC/NFR](integration/backlog-source.json) và
[đối chiếu nguyên văn S-35…S-51](sprint6-8-requirements.md). Không lấy yêu cầu
trong tài liệu làm lệnh xóa dữ liệu hoặc triển khai. S-35…S-51 tuân theo workbook;
các mục “chưa refine” vẫn ghi rõ, không coi là đã có quyết định nghiệp vụ.

`DONE` trong bảng là triển khai và kiểm thử kỹ thuật local, không thay thế
peer review, staging, thiết bị thật hoặc xác nhận hợp nhất dữ liệu. `PARTIAL`
ghi rõ tiêu chí còn thiếu. S-04 còn khác biệt: workbook cho ban quản lý tạo dự
án, yêu cầu Super Admin sau đó giới hạn tạo dự án toàn hệ thống; giữ chính sách
đã triển khai, không tự mở rộng quyền để làm xanh nghiệm thu.

| Story | Sprint | Trạng thái | Kết quả / giới hạn |
| --- | ---: | --- | --- |
| S-01 | 1 | PARTIAL | Khung/build/CI config local PASS; staging auto deploy/rollback chưa có môi trường. |
| S-02 | 1 | DONE | Argon2id, khóa sai nhiều lần, phiên 12h idle; SQL/Auth PASS, người dùng xác nhận login cũ trên đúng nguồn. |
| S-03 | 1 | DONE | Project-scoped query/RBAC, default deny và audit 403: SQL/E2E PASS. |
| S-04 | 1 | PARTIAL | Dự án/cây/chặn vòng và xóa dữ liệu liên quan PASS; chính sách tạo dự án và benchmark WBS 500 còn cần nghiệm thu. |
| S-05 | 2 | DONE | CRUD lá/thời lượng, xác nhận delete, xóa edge tường minh/audit, chặn actuals/lịch sử: SQL/UI PASS. |
| S-06 | 2 | DONE | FS/SS/FF/SF, lag âm, self/duplicate: SQL/UI PASS. |
| S-07 | 2 | DONE | Topo/cycle/tail/bridge, 500 và chuỗi 20.000 việc không tràn stack: PASS. |
| S-08 | 2 | DONE | Duyệt xuôi bốn loại, max ràng buộc và lag âm: fixed-answer tests PASS. |
| S-09 | 2 | DONE | Duyệt ngược, float/critical/nhánh song song: PASS. |
| S-10 | 2 | PARTIAL | Bộ đáp án cố định PASS; phát hiện 4 mutant công thức; nguồn tính tay cần peer review độc lập. |
| S-11 | 2 | DONE | Chặn cycle atomic, tên chuỗi lỗi và UI: PASS. |
| S-12 | 2 | PARTIAL | CPM cache/invalidation/bảng/filter PASS; benchmark API 500 việc trên staging chưa đo. |
| S-13 | 3 | PARTIAL | Gantt tự vẽ, scale/windowing/mobile PASS; NFR hiệu năng trên thiết bị/staging thực chưa nghiệm thu. |
| S-14 | 3 | DONE | Marker găng không chỉ màu, tooltip/keyboard/forced colors/print: UI PASS. |
| S-15 | 3 | DONE | Actuals tách kế hoạch, ngày/%/mở lại: SQL/UI PASS. |
| S-16 | 3 | DONE | Trễ găng/không găng, đang làm, 500 việc async và CPM API: PASS. |
| S-17 | 3 | DONE | Lịch 6/5 ngày, lễ/chủ nhật/lag và sửa lịch thật: PASS. |
| S-18 | 3 | DONE | Baseline riêng, lịch sử chốt lại, bất biến/overlay: SQL/E2E PASS. |
| S-19 | 3 | DONE | Mốc, chuỗi găng và lifecycle alert: SQL/E2E PASS. |
| S-20 | 3 | PARTIAL | Hai backup restore/count/hash PASS, script scheduler có; lịch đêm/storage ngoài đĩa staging chưa chạy. |
| S-21 | 4 | DONE | Journal ngày/giờ/tác giả/lá, persistence và quyền: SQL/E2E PASS. |
| S-22 | 4 | DONE | Header nhân lực/thiết bị/thời tiết/catalog: SQL/E2E PASS. |
| S-23 | 4 | DONE | Nhiều ảnh, nén hiển thị/giữ gốc/hash và quan hệ: SQL/E2E PASS. |
| S-24 | 4 | DONE | Khóa ngày/record, SQL guards, lý do unlock/audit: PASS. |
| S-25 | 4 | DONE | Team assignment, overload, chuyển đội/lịch sử/đúng người: PASS. |
| S-26 | 4 | DONE | Worker scoped việc/sản lượng/ngày/sự cố: SQL/mobile E2E PASS. |
| S-27 | 4 | PARTIAL | Manifest/SW/offline shell PASS; cập nhật worker và mở lại PWA cũ trên Samsung PASS; camera/mobile UAT đang thực hiện. |
| S-28 | 4 | DONE | Invite/token/register, đổi/gỡ quyền và người quản lý cuối: SQL/E2E PASS. |
| S-29 | 5 | DONE | 20 mục/30 ảnh bền qua reload và browser restart: PASS. |
| S-30 | 5 | PARTIAL | FIFO/idempotency/retry/identity và background sync local PASS; app đóng trên Android thật chưa kiểm. |
| S-31 | 5 | DONE | Queue count/timestamp cục bộ, lỗi từng mục: E2E PASS. |
| S-32 | 5 | DONE | Revision/field merge, giữ hai bản và ảnh/lịch sử conflict: SQL/E2E PASS. |
| S-33 | 5 | DONE | Ảnh sau journal, retry/placeholder; tự hiện journal khi ảnh còn chờ: E2E assertion bổ sung PASS. |
| S-34 | 5 | PARTIAL | Ca 20/30 + replay <3 phút local PASS, đã nối CI; remote CI chưa chạy. |
| S-35 | 6 | DONE | NUMERIC lá, rollup giá trị cha và bridge hợp đồng: SQL/E2E PASS. |
| S-36 | 6 | DONE | Theo kỳ/lũy kế đã duyệt/sản lượng/ảnh/reviewer: SQL/E2E PASS. |
| S-37 | 6 | DONE | DB guard/locks/unique chống vượt và concurrent request: PASS. |
| S-38 | 6 | DONE | Submit/approve/return lý do, bất biến/phiếu thay thế: SQL/E2E PASS; refinement riêng ghi dưới. |
| S-39 | 6 | DONE | Append-only audit actor/before/after, bảo vệ hồ sơ và khóa: SQL/E2E PASS. |
| S-40 | 7 | DONE | EXIF từ byte gốc, hash/time/GPS/thumbnail, quyền file: PASS. |
| S-41 | 7 | DONE | Tâm/radius/Haversine/khoảng cách cho duyệt và PDF: PASS. |
| S-42 | 7 | DONE | Thiếu EXIF/screenshot/tuổi ảnh so ngày nghiệm thu, mức tin cậy: PASS. |
| S-43 | 7 | DONE | Snapshot nghiệm thu × đơn giá, tiền chính xác, chống trùng/concurrency: PASS. |
| S-44 | 7 | DONE | Duyệt/trả lại, khóa và released giữ lịch sử/tái sử dụng: SQL/E2E PASS. |
| S-45 | 7 | DONE | Tỷ lệ dự án, gross/retained/net, round half-up/lũy kế đã duyệt: PASS. |
| S-46 | 8 | DONE | Budget lá/cha, version sau thực chi và lịch sử: PASS. |
| S-47 | 8 | DONE | Chi phí ngày/loại/lá, CSV atomic/idempotent và chờ phân bổ: PASS. |
| S-48 | 8 | DONE | Spend >80% + accepted <80%, rollup và biên tính tay: PASS. |
| S-49 | 8 | DONE | Giá trị hợp đồng, baseline gốc/lịch/milestone/găng; thiếu ngữ cảnh không bịa: PASS. |
| S-50 | 8 | DONE | PDF tiếng Việt/ảnh/GPS/các đợt/actor, quyền và download: PASS; mẫu chính thức chưa duyệt. |
| S-51 | 8 | PARTIAL | Health app/DB, timeout/redaction, monitor >300s/retry/recovery local PASS; staging/team channel BLOCKED. |

## 3. PostgreSQL và dung lượng — PASS local

PostgreSQL **17.11**, service postgresql-x64-17 Running, port 5432, recovery=false.
Data: C:/Program Files/PostgreSQL/17/data. Dung lượng C kiểm tra lúc chốt:
**4.79 GiB (5143531520 bytes)** sau khi build/chạy Docker. Các công cụ kiểm tra tối thiểu 2 GiB trước
thao tác PG; backup/cache/profile trình duyệt nằm trên D. Không còn dùng lý do
ổ C đầy để bỏ qua restore/migration. Chưa đủ bằng chứng để suy rộng sang tải production.

Hai nguồn đã đối chiếu lại cả trước/sau hợp nhất và cuối lượt: 40 bảng nghiệp vụ
gốc, 50 bảng nghiệp vụ Sprint 4–5, tài khoản/hash/quyền/memberships và migration
history cũ giữ nguyên. [Preflight](integration/merge-source-preflight.json),
[xác minh chỉ đọc](integration/merged-final-verification.json).
Regression dùng construction_integration_1792010879312_test, chỉ schema UUID
do tests sở hữu; không trỏ test URL vào database nguồn hoặc public của 3082.

## 4. Backup, restore, migration và rollback — PASS trên bản sao

Hai archive đã xác minh hash/inventory được restore lại vào database mới, rồi
migrate Sprint 1–8; không --clean, không DROP/restore đè nguồn. Sprint 4–5 là
nền của construction_merged_copy_1792015129032; nguồn gốc được restore/migrate riêng thành
construction_merge_staging_1792015129032 để ánh xạ dữ liệu, không đọc dữ liệu QA thay nguồn.

| Backup nguồn | Bytes | SHA-256 |
| --- | ---: | --- |
| construction_management | 664506 | 071314879ea71fc4979a45cc5b49bd9bbb258612e0016754c9adbacb6a6437f6 |
| construction_sprint45_demo | 6739384 | 74d2225fa721ce0481c848045a4cf3e49a606fec367ca56fd0871bf3dfc10b61 |

Mỗi copy hiện có 54 bảng/22 migration records. Giữ nguyên 43 file migration
lịch sử và 021; biến thể 014 chỉ khác newline được kiểm checksum/schema chính
xác, không rewrite history, không thêm 022. [Proof restore/hợp nhất](integration/merged-copy.json).

Backup mới của bản hợp nhất: **6758158 bytes**, SHA-256
**8a283023655da7dd1e55ed3885af97bb2745de26c0927107f6ccc391b5a46d1b**. Dùng exported snapshot READ ONLY để không gián đoạn UAT,
restore vào construction_merged_backup_test_1792015669856; cả **54 bảng/tất cả cột bằng nhau**,
117 FK hợp lệ. Bao gồm tài khoản/ảnh/session tại thời điểm snapshot; không
in dữ liệu bí mật. [Proof backup mới](integration/merged-backup-restore.json).

Rollback khi import lỗi đã chạy thật: cố tình làm hỏng FK task sau khi đã nhập
users/projects/items trên DB test riêng; rollback phục hồi nguyên 54 bảng và
mọi trigger. [Proof](integration/merge-rollback-test.json). Down021/up021 trước
đó PASS trên copy chưa có dữ liệu tài chính mới; không khẳng định rollback
phá hủy được phép trên production có hồ sơ đã duyệt. Không DROP database nào.
Các bản sao của lần rehearsal dừng sớm được giữ để chẩn đoán.

## 5. Kết quả hợp nhất dữ liệu — PASS bảo toàn và ánh xạ

Giữ nguyên ID và mọi hàng Sprint 4–5; các ID gốc được ánh xạ mới, kể cả FK
composite và parent WBS. Vai trò hệ thống ánh xạ theo tên, không lấy quyền cao
nhất. Email chuẩn hóa chỉ để phát hiện trùng; email lưu nguyên nguồn được chọn.
Một email trùng về đúng một tài khoản. Hai CPM cùng tên vẫn là hai dự án riêng.

| Dữ liệu | Gốc cũ | Sprint 4–5 | Sau hợp nhất |
| --- | ---: | ---: | ---: |
| Tài khoản duy nhất | 4 | 6 | 9 |
| Dự án | 2 | 1 | 3 |
| Hạng mục | 3 | 1 | 4 |
| Công việc | 10 | 4 | 14 |
| Memberships | 8 | 5 | 13 |
| Phụ thuộc | 10 | 0 | 10 |
| Schedule results | 10 | 4 | 14 |
| Nhật ký | 0 | 4 | 4 |
| Ảnh gốc | 0 | 6 | 6 |
| Phiên bản nhật ký | 0 | 11 | 11 |
| Đội thi công | 0 | 2 | 2 |
| Tiến độ ngày | 0 | 1 | 1 |
| Audit logs | 0 | 28 | 28 |
| Thông báo | 0 | 2 | 2 |
| Nghiệm thu / thanh toán / thực chi | 0 | 0 | 0 |

| Dự án nguồn | ID mới | Dữ liệu chính |
| --- | ---: | --- |
| Sprint 4–5, QA_SPRINT4_5 ID 1 | 1 | 1 hạng mục, 4 việc, 4 nhật ký, 6 ảnh, 2 đội, 1 tiến độ ngày |
| Gốc, Dự án demo CPM ID 1 | 2 | 1 hạng mục, 5 việc |
| Gốc, Dự án demo CPM ID 2 | 3 | 2 hạng mục, 5 việc |

Số đếm là snapshot ngay khi hợp nhất; UAT có thể phát sinh hàng mới. Hai nguồn
không có nghiệm thu/thanh toán/thực chi/dự toán: giữ đúng 0, không tạo dữ liệu
mẫu thay dữ liệu thật. Quy trình tài chính/concurrency được kiểm thử trên fixture
riêng. Toàn bộ byte ảnh gốc và snapshot/audit Sprint 4–5 giữ nguyên; nguồn gốc
không có lịch sử JSON cần remap. Tool dừng khi gặp JSON quan hệ chưa được review,
không tự sao chép ID cũ trong snapshot. Đây là công cụ cho hai nguồn đã kiểm kê,
không phải bộ hợp nhất tổng quát cho các database có dữ liệu khác.

Trong transaction import, chỉ tạm dừng sáu trigger sinh dữ liệu mặc định/đánh dấu
CPM dirty của bản sao mới để giữ nguyên các hàng đã migrate. FK/CHECK và guard
tài chính/auth/lịch sử luôn hoạt động; tất cả trigger bật lại trước commit.
So sánh mọi hàng nền và mọi hàng nhập theo mapping, kiểm 117 FK, unique email
và đồng bộ SERIAL sequences. [Counts/mapping/proof](integration/merged-copy.json).

## 6. Tài khoản và phân quyền — PASS dữ liệu và UAT Windows

Chủ hệ thống xác nhận phương án 1 ngày 15/10/2026. Tài khoản
**dtc245160003@ictu.edu.vn** giữ ID 2, email, hash, trạng thái và toàn bộ hồ sơ
Sprint 4–5: global Engineer, system Super Admin; Admin ở QA (ID 1), Worker ở
hai CPM (ID 2/3). Audit cấp SA trước tích hợp được giữ. Không gọi grant/reset
hoặc sửa Authentication trong quá trình nhập.

Super Admin có quyền toàn hệ thống theo xác nhận; các membership Worker vẫn
được lưu, không giới hạn Super Admin xuống Worker. Mật khẩu đăng nhập tài khoản
trùng dùng đúng hồ sơ Sprint 4–5 được chọn; hash nguồn cũ vẫn còn trong backup
nguồn, không tạo fallback chấp nhận hai hash. 8 email không trùng giữ hash nguồn.

| ID mới | Global role | System role | Project ID: membership | Kết quả |
| ---: | --- | --- | --- | --- |
| 1 | engineer | user | 1: project_manager | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 2 | engineer | super_admin | 1: admin; 3: worker; 2: worker | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 3 | engineer | user | 1: worker | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 4 | engineer | user | 1: worker | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 5 | engineer | user | 1: engineer | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 6 | engineer | user | Chưa tham gia | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 7 | engineer | user | 3: engineer; 2: engineer | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 8 | viewer | user | 3: viewer; 2: viewer | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |
| 9 | viewer | user | 3: viewer; 2: engineer | Bảo toàn PASS; UAT nhóm tài khoản đã xác nhận |

Kiểm tra chỉ đọc xác nhận **9/9 email/hash/fullname/global role/system role/
active state** khớp nguồn được duyệt. 13 memberships đúng mapping. Global role
không thay project role: ID 9 global Viewer nhưng Engineer ở CPM 2, Viewer ở CPM 3.
Account 6 không có dự án là đúng dữ liệu nguồn, không tự gán dự án.

| Vai trò kiểm thử độc lập | Kết quả fixture SQL/E2E |
| --- | --- |
| Super Admin | PASS login, quản trị/tạo dự án, bảo vệ SA cuối cùng, cập nhật quyền |
| Admin / Project Manager | PASS quyền quản lý dự án và thành viên |
| Engineer | PASS chức năng kỹ sư, API và quy trình hồ sơ được cấp |
| Worker | PASS chức năng đội trưởng và từ chối thao tác ngoài quyền |
| Accountant | PASS chức năng kế toán và giới hạn menu/API; nguồn thật hiện không có membership Accountant |
| Viewer / tài khoản không là thành viên | PASS đọc đúng quyền, không sửa; chặn truy cập ngoài dự án |

UAT Windows trên bản hợp nhất đã được chủ hệ thống xác nhận PASS ngày 15/10/2026:
Super Admin và tài khoản cũ đăng nhập được, đủ 3 dự án, dữ liệu/menu/quyền đúng.
Kết quả này là xác nhận người dùng, tách biệt với fixture SQL/E2E; chưa có danh
sách từng email đã thử. Không reset mật khẩu/quyền để kiểm tra.
[Biên bản UAT](integration/windows-merged-uat.json),
[profile/memberships](integration/merged-final-verification.json).

## 7. Kiểm thử kỹ thuật thực chạy — PASS local

| Nhóm | Kết quả | Bằng chứng |
| --- | --- | --- |
| Backend | 374 PASS, 40 suites; 9 file PG/102 tests | [JSON](integration/backend-all-tests.json) |
| Frontend unit | 22 PASS | [Kết quả thực chạy](integration/merge-tests/static-validation.json) |
| Backend / Frontend lint | PASS | Không warning lint |
| Production build riêng | PASS; 21 file byte-for-byte khớp build đang chạy | [Proof](integration/merge-tests/static-validation.json) |
| pwa | 10 PASS, 0 FAIL, 0 SKIP | [JSON](sprint4-5/playwright-results.json) |
| realRegression | 12 PASS, 0 FAIL, 0 SKIP | [JSON](sprint4-5/real-regression-results.json) |
| systemAdmin | 3 PASS, 0 FAIL, 0 SKIP | [JSON](super-admin/playwright-results.json) |
| sprint68 | 2 PASS, 0 FAIL, 0 SKIP | [JSON](sprint6-8/playwright-results.json) |
| ui | 33 PASS, 0 FAIL, 1 SKIP | [JSON](sprint4-5/ui-regression-results.json) |
| worker | 1 PASS, 0 FAIL, 0 SKIP | [JSON](sprint4-5/worker-development-results.json) |
| unifiedShell | 1 PASS, 0 FAIL, 0 SKIP | [JSON](integration/unified-shell-results.json) |
| Rollback partial import | PASS 54 bảng và trigger | [JSON](integration/merge-rollback-test.json) |
| Backup hợp nhất restore | PASS 54 bảng, 117 FK | [JSON](integration/merged-backup-restore.json) |

Tổng Playwright **62 PASS / 1 SKIP / 0 FAIL / 0 flaky**. Ca opt-in
worker bị skip trong UI đã chạy riêng và PASS. PWA đủ 10 ca; ca 20 nhật ký/
30 ảnh + replay mất **88.217 giây**, có reload/browser restart,
checksum ảnh và chống trùng; không suy rộng sang background sync Samsung thật.
SQL có Auth/RBAC, nghiệm thu/thanh toán, transaction/concurrency, nâng cấp legacy,
checksum guard, task-delete và audit. Không ghi fixture vào bản hợp nhất UAT.
[Log từng lệnh](integration/merge-tests/runs.json),
[tổng hợp máy đọc](integration/validation-summary.json).

Windows sandbox chặn child spawn ở một số lệnh (EPERM); các lệnh cần thiết đã
chạy lại ngoài sandbox và có exit 0. Lần restore dừng sớm và guard khác bộ đếm
SA được xử lý trên copy riêng, không tác động nguồn. Không lấy kết quả cũ để
báo PASS thay các bộ hồi quy vừa chạy. Các audit/mutation trước đó được giữ
với timestamp gốc, không ghi là đã chạy lại nếu chưa chạy.

Kiểm chứng bổ sung trong lượt Samsung: **5/5 Backend targeted tests PASS**
(2 tests mới cho gate và 3 launcher tests đã có), lint Backend PASS. Bộ full
Backend gần nhất vẫn là 374 tests; không cộng trùng hoặc báo đã chạy full 376.
PWA Chrome profile riêng trên production shell 4174 PASS: worker chờ xác nhận
cập nhật, giữ nguyên IndexedDB journal/photo bytes qua update/reload, từ chối
sync chưa login mà không xóa bản nháp, shell offline/mobile viewport 412. Đây
chưa phải kiểm thử camera/Android thật.
[Targeted JSON](integration/samsung-backend-tests.json),
[PWA preservation](integration/samsung-shell-desktop-test.json).

## 8. Lỗi đã khắc phục và phần còn PARTIAL/BLOCKED

- Khôi phục đúng nguồn tài khoản và hợp nhất FK/ID trên bản sao mới; xử lý trùng
  email theo lựa chọn rõ ràng, giữ quyền dự án và hồ sơ SA sẵn có.
- Guard hợp nhất ban đầu so sánh sai bộ đếm SA giữa nguồn không có SA và nguồn
  có SA: đổi sang kiểm mỗi bộ đếm khớp active admins của chính nguồn đó. Lần
  dừng đã rollback; không thay dữ liệu/quyền để vượt guard.
- Plugin version Service Worker dùng cứng dist khi build --outDir: sửa lấy
  thư mục từ Vite resolved config. Build kiểm chứng giờ có SW version đúng và
  byte-for-byte khớp build đang chạy; frontend/dist giữ nguyên hash trong UAT.
- Lỗi launcher PWA báo cần Chrome: log xác định Android AppsFilter chặn host;
  reboot do chủ máy thực hiện đã khôi phục PWA cũ, không reset/cài lại/xóa offline.
  Server Samsung hỗ trợ cả IPv4/IPv6 loopback và production build đúng merged DB.
- Render template cập nhật plan ID starter cũ thành 0.5c-512mb theo tài liệu
  chính thức hiện hành; auto deploy vẫn off, chưa tạo/mua/deploy service.
- Giữ các sửa đã hồi quy: journal hiện trước khi ảnh upload xong, GET phục hồi
  khi online, checkbox Settings chờ lưu thành công, menu chờ quyền tải xong,
  launcher không tự migrate/seed và task DELETE bảo toàn lịch sử/audit.

UAT sử dụng chung Samsung đã được chủ máy xác nhận PASS. Còn PARTIAL: bằng chứng
camera/nhật ký có ảnh qua đóng mở offline/reconnect/background sync; NFR thiết bị/staging,
peer review và refinement/S-04. UAT Windows đã PASS. Docker đã build/run PASS
trên PostgreSQL và volume thử riêng; chốt Docker tại phần 11. Chưa remote CI,
staging HTTPS/backup lịch đêm/kênh cảnh báo team thật. Chưa phát hành production.

## 9. Dọn dẹp và bảo vệ thay đổi — DONE phạm vi an toàn

Ở lượt hợp nhất trước đã xóa cache tái tạo được **.tmp/jest-migrations/**: 32 file,
1.041.603 bytes, không còn tham chiếu runtime. Đã xác minh đường dẫn tuyệt đối
trong workspace, không reparse point, chỉ cache Jest; giữ manifest hash riêng.
Lượt Samsung này không xóa thêm file: giữ build đang chạy, checkpoint/ADB logs,
APK chẩn đoán, backup/restore/migration/test evidence phục vụ đối chiếu.
Hai patcher cũ đã hash-archive/xóa ở lượt trước vẫn được ghi rõ trong
[cleanup manifest](integration/cleanup-manifest.json).

Giữ file credentials đang mở, tất cả database nguồn/copies/rehearsal, backup,
migrations, evidence lỗi, snapshot lịch sử và các worktree. Không xóa database
hoặc ghi đè thay đổi chưa commit. Tests chỉ dọn schema UUID do chúng sở hữu.
.env/.private/.tmp/dump/credentials được ignore và loại khỏi Docker context.
[Secret scan](integration/secret-scan.json),
[hash migration/backup và root status](integration/source-preservation.json).

## 10. Samsung Note20 Ultra — PWA cũ đã khôi phục / camera-offline UAT đang thực hiện

Giữ nguyên WebAPK org.chromium.webapk.ad2f332a21b6feb12_v2, Chrome com.android.chrome,
Android user 0 và origin **http://localhost:4174**, start URL /site-journal.
SM-N985F, Android 13/SDK 33, Chrome 155.0.8059.39; Chrome/PWA cài và bật,
manifest runtimeHost đúng Chrome. Không cài lại/reset/gỡ hay xóa dữ liệu app.

Nguyên nhân trực tiếp của lỗi “yêu cầu Chrome” đã xác định bằng logcat: Android
**AppsFilter chặn WebAPK → com.android.chrome**, cùng thời điểm chọn host.
Chrome vẫn hoạt động; lỗi xuất hiện trước khi vào web app. Sau khi chủ máy
khởi động lại Samsung bình thường, biểu tượng PWA cũ mở thành công. Đây là
khôi phục **PASS do chủ máy xác nhận và kiểm tra thiết bị**. Chưa xác định chính
xác lỗi Android nào khiến graph/cache visibility sai trước reboot; không kết
luận Chrome không tương thích hoặc cần cài lại.
[Log trước reboot](integration/samsung-webapk-targeted-log.json),
[recovery proof](integration/samsung-webapk-recovery.json).

ADB Wi-Fi sau reboot **192.168.2.32:42265**, đã kiểm tra devices và reverse
tcp:4174 → tcp:4174 bằng -s. Server phục vụ production shell riêng, bind cả
127.0.0.1 và ::1, không demo/migrate/seed/sửa .env. Cửa sổ PWA được đọc qua CDP:
standalone=true, visible, secureContext=true, viewport 411×808, đúng bundle
index-CsBLCOBv.js; active cache xds-journal-shell-9de6d9ccbe33c68e, worker activated,
không waiting/installing worker. Runtime fetch từ điện thoại xác nhận
**construction_merged_copy_1792015129032**, build worker SHA-256
31e95bc7f4eb573c1246a6417d11802ab126c0b7dfe379d34e1fc952960dc3ad.
[ADB](integration/samsung-adb-verification.json), [PWA screen](integration/samsung-pwa-recovered-screen.json).

Chủ máy đã bấm Cập nhật ứng dụng trên Chrome trước reboot. IndexedDB version 2
trước/sau update đều 0 queue/0 photos; mọi hàng của cả bốn stores giống nhau,
checkpoint riêng trên D/.private. Sau reboot và người dùng đăng nhập, queue/
photos vẫn 0; cache/control tăng từ 2/3 lên 3/4 do metadata phiên/dự án, không
coi đây là mất dữ liệu. Worker chỉ dọn cache shell cũ sau update đã xác nhận,
không xóa IndexedDB; không thao tác Clear storage/cache hoặc unregister.
[Update proof](integration/samsung-worker-update.json),
[checkpoint hiện tại](integration/samsung-readonly-checkpoint.json).

Xác minh session thật ngay trong PWA: **GET /auth/me 200, user ID 2,
system_role super_admin; GET /projects 200, IDs 1/2/3**. Không dùng credential
mẫu, không đọc/ghi mật khẩu, cookie/token hoặc thay quyền. Các vai trò khác
trên Samsung chưa được kiểm trực tiếp; UAT Windows nhóm tài khoản cũ đã PASS.

Sau khi queue cũ rỗng được kiểm kê và build/database khớp, đã mở business gate
riêng cho bản sao Samsung. Runtime **businessWrites=ENABLED**; POST sync không
login trả **401**, xác thực/RBAC không bị bỏ qua. Lệnh mở gate chỉ sửa control
file local, không migrate/seed/tạo dữ liệu. Restart process sẽ đưa gate về held.
[Sync readiness](integration/samsung-sync-readiness.json).

Chủ máy phản hồi ứng dụng sử dụng ổn định, không phát hiện lỗi: **UAT sử dụng
chung Samsung PASS theo xác nhận người dùng**. Phản hồi không nêu kết quả riêng
camera/số queue/ảnh qua đóng mở offline/reconnect hoặc background sync; giữ
các tiêu chí đó chưa đủ bằng chứng, không tự đánh dấu PASS hoặc yêu cầu người
dùng lặp lại các bước đã thử. [Biên bản](integration/samsung-owner-uat.json).

Theo yêu cầu mới không tự đồng bộ, đã **đưa gate Samsung về held** bằng control
file local, không restart server, không chạm IndexedDB/database. Login/logout/GET
vẫn hoạt động; ghi/sync 503 giữ queue. Không gọi sync API, gửi ảnh/bản nháp hoặc
tự mở app để retry. Kết quả ENABLED/401 ở trên là bằng chứng của pha trước;
trạng thái cuối **HELD_FOR_OFFLINE_REVIEW**. [Runtime hiện tại](integration/samsung-runtime.json).
[Hướng dẫn Windows/Samsung](integration/WINDOWS-SAMSUNG-UAT.md).

Tham chiếu [Android package visibility](https://developer.android.com/training/package-visibility/automatic),
[Chromium host selector](https://raw.githubusercontent.com/chromium/chromium/main/chrome/android/webapk/shell_apk/src/org/chromium/webapk/shell_apk/LaunchHostBrowserSelector.java).

## 11. Docker và Render HTTPS — Docker PASS / cloud chưa triển khai

Đã khởi động Docker Desktop ở chế độ ẩn; Engine **29.8.0**.
Root Dockerfile build **PASS**, image xay-dung-so:merged-local-uat,
ID sha256:f8decc9569b261c126feee04747736ed2cad8d19530206c7676e75b17a4af798. Không push image hoặc deploy production.

Đã chạy app tại **http://localhost:4188/login**, cùng PostgreSQL container riêng
construction_docker_merged_test_1792017312919, volume riêng. Restore backup hợp nhất vào DB Docker mới,
không kết nối app thử vào PG Windows. **54 bảng/tất cả cột khớp snapshot**,
schema check PASS, health HTTP 200 và Docker HEALTHCHECK healthy; React login
HTML 200, API chưa login 401, runtime user node UID 1000. Cookie Secure=false
chỉ vì bản thử local HTTP này; Render template vẫn Secure=true/TRUST_PROXY=1.
[Docker proof](integration/docker-merged-uat.json).

Native Linux probe PASS: Sharp tạo/đọc JPEG, Argon2id hash/verify trong bộ nhớ,
PDF font tiếng Việt đọc được và header hợp lệ (8461 bytes).
Ảnh giữ trong PG BYTEA: 6 originals tổng 5.725.862 bytes, 6 thumbnails tổng
230.612 bytes; các bytes đã được đối chiếu restore. Không dùng filesystem tạm
để lưu ảnh người dùng. [Media proof](integration/docker-native-media-test.json).
Giữ container/volume thử để review, không prune hoặc xóa database/backup.

Render Blueprint/Compose/CI/Bash parse/syntax PASS từ lượt trước; plan
0.5c-512mb, auto deploy off, secret qua env, preDeploy db:check chỉ đọc,
PORT/0.0.0.0 và health. Đã chứng minh image Linux khởi động cùng PostgreSQL;
**chưa tạo service/cloud DB, upload dữ liệu hay kiểm HTTPS/TLS trên Render**.
Staging sau này restore backup hợp nhất đã nghiệm thu vào DB cloud riêng,
kiểm old profiles/ảnh/FKs/session/cookie/PWA/PDF trước phát hành.
[Hướng dẫn Render](integration/RENDER-HTTPS.md),
[phần còn thiếu trước triển khai](integration/RENDER-READINESS.md),
[Blueprint chính thức](https://render.com/docs/blueprint-spec).

## 12. Trạng thái cuối và phần còn thiếu trước Render

**Hợp nhất, UAT Windows và UAT sử dụng chung Samsung PASS** theo phạm vi bằng
chứng đã ghi. Docker build/runtime/PostgreSQL/native media PASS. Bản hợp nhất
hiện có 9 users/3 projects/4 items/14 tasks/13 memberships/4 journals/6 photos;
nghiệm thu/thanh toán/thực chi vẫn 0 như nguồn. Health 3082/4174/4188 đều 200.
[Kiểm kê cuối](integration/final-runtime-inventory.json).

Samsung giữ PWA cũ, origin, worker mới và dữ liệu offline; root cause launcher
đã có log và recovery PASS. Theo chủ máy, không yêu cầu lặp lại UAT đã thử,
không tự sync. Gate Samsung cuối đang held; queue hiện tại sau đợt UAT chưa
được kiểm kê lại, không suy từ số 0 trước UAT. Không xóa hoặc gửi dữ liệu.

Phần chưa đủ để chốt phát hành: camera/offline/reconnect/background sync và
từng vai trò Samsung chưa có xác nhận riêng; remote CI/peer review; cloud PG
restore/đối chiếu; Render HTTPS/Secure cookie/PWA/ảnh/PDF thực tế; backup theo
lịch/monitor/kênh team; NFR và refinement/chính sách/mẫu còn mở trong bảng Story.
[Danh sách trước triển khai Render](integration/RENDER-READINESS.md).

Mã còn local/uncommitted theo yêu cầu, chưa đưa lên remote hoặc deploy. Không
upgrade/reset hai nguồn, đổi mật khẩu/quyền, xóa dữ liệu/worktree, commit/push/
merge hoặc deploy production. Giữ các server/containers, backup, migrations và
checkpoint để tiếp tục công việc được phép sau này.

## 13. Tiếp tục phần đăng xuất sidebar — 20/10/2026

Tiếp tục từ phần `SidebarLogout` đang làm dở, giữ nguyên các bước hợp nhất và
UAT đã hoàn tất. Cấu hình/lệnh kiểm thử đăng xuất đã được đưa vào mã nguồn;
phần xử lý nhận diện offline sau đăng xuất và cảnh báo ảnh xung đột được hoàn
thiện riêng trong phạm vi này. Kết quả mới và giới hạn kiểm chứng được ghi tại
[checkpoint đăng xuất](integration/logout/README.md), tách khỏi bằng chứng
lịch sử ngày 15/10.

Lượt cuối: lint PASS, 26/26 frontend unit, 16/16 kiểm thử trình duyệt riêng cho
đăng xuất và build PASS; không bỏ qua/flaky. Có hồi quy 403 chuyển sang dự án
được cấp quyền, lỗi dọn nhận diện offline và giữ nguyên bytes ảnh/bản nháp.
Build riêng `.tmp/logout-resume-build` chưa thay thế bản đang phục vụ Samsung.

Lượt tiếp tục không thao tác điện thoại, tự đồng bộ, đổi gate Samsung hoặc ghi
dữ liệu nghiệp vụ vào database nguồn/copy. Bản build và trình duyệt kiểm thử
dùng thư mục/cổng riêng; chưa commit/push/merge hoặc deploy.

## 14. Kết nối PWA và đối chiếu yêu cầu — 20/10/2026

Chủ hệ thống đã ghi nhận checkpoint logout 26 unit/16 browser/lint/build PASS.
Không sửa frontend hoặc chạy lại các bộ đó trong lượt khôi phục kết nối.
Trước sửa không có listener 3082/4174 và ADB không thấy Samsung; đã khởi động
đúng hai server từ bản hợp nhất, dùng build logout đã đối chiếu hash, giữ mọi
asset cũ và Samsung `HELD_FOR_OFFLINE_REVIEW`. Health/runtime/API host PASS;
thêm lệnh `pwa:recover` cùng 21 kiểm thử/lint mới PASS. Điện thoại chưa kết nối,
nên HTTP/login/menu/đăng xuất và dữ liệu offline trên máy thật còn PARTIAL.
[Checkpoint kết nối và thao tác cần xác minh](integration/connectivity/README.md).

Đọc trong transaction READ ONLY thấy **10 users, 3 projects, 14 memberships,
6 journals, 11 photos**; số liệu này mới hơn snapshot 15/10, không restore
snapshot cũ đè copy. Chưa migrate/seed, đổi mật khẩu/quyền, sync Samsung hoặc
commit/push/merge/deploy.

Đã đối chiếu đủ S-01–S-51 với workbook gốc nguyên hash. Giữ 41 PASS/10 PARTIAL
kỹ thuật đã ghi; đối chiếu AC/NFR/refinement sau phép đo mới là 24 PASS/27
PARTIAL. Ba kiểm thử đồ thị mới/lint PASS; S-11 đo 500 công việc/2.000 quan hệ
trong bộ nhớ đạt <500 ms, S-16 tính toán đạt nhưng UI vẫn thiếu bằng chứng.
DoD phát hành vẫn PARTIAL: review độc lập, coverage baseline, typecheck,
dependency dev, remote CI, staging/HTTPS, phần vận hành và quyết định nghiệp
vụ còn mở. [Audit 51 Story](integration/2026-10-20-story-audit.md),
[RENDER-READINESS đã cập nhật](integration/RENDER-READINESS.md).

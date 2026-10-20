# Trạng thái trước triển khai Render HTTPS — 20/10/2026

**Sẵn sàng về bản chạy local/Docker; chưa đủ bằng chứng để chốt phát hành toàn
bộ Sprint 1–8 trên Render. Chưa deploy, upload dữ liệu hoặc tạo/mua dịch vụ.**
Chủ hệ thống yêu cầu giữ database nguồn, copy và offline data; không tự
commit/push/merge. Các điểm thiếu dưới đây không được thay bằng tài khoản mẫu
hoặc đánh dấu PASS theo phản hồi UAT sử dụng chung.

## Checkpoint mới 20/10 — local đã khôi phục, thiết bị còn PARTIAL

Đăng xuất giữ kết quả **26 unit / 16 browser / lint / build PASS** đã được chủ
hệ thống ghi nhận; không chạy lại khi mã frontend không đổi. Lỗi kết nối mới
được kiểm tra riêng: không có listener 3082/4174 và không có Samsung trong ADB.
Đã khôi phục hai server bằng bản hợp nhất, health/runtime 200, bundle đã kiểm
thử và Samsung vẫn `HELD_FOR_OFFLINE_REVIEW`. Có công cụ `pwa:recover` để kiểm
runtime sống, khôi phục server còn thiếu và reverse đúng thiết bị; 21 kiểm thử
mới cùng lint đã PASS. Không đánh dấu lỗi trên Samsung đã hết khi chưa có HTTP
hoặc UI từ máy thật. [Checkpoint và bằng chứng](connectivity/README.md).

Transaction chỉ đọc ghi nhận bản hợp nhất hiện có **10 users / 3 projects /
14 memberships / 6 journals / 11 photos**. Snapshot 15/10 và các số liệu 9 tài
khoản dưới đây là lịch sử; chuẩn bị cloud cần snapshot mới nhất. Phiên đăng
nhập thật, menu đúng quyền và nút Đăng xuất mới trên Samsung đang PARTIAL, chờ
USB hoặc IP:cổng Wireless Debugging hiện tại và xác minh trực tiếp; không tự
đồng bộ để lấy bằng chứng.

Đã đối chiếu toàn bộ [51 Story với nguồn gốc](2026-10-20-story-audit.md), gồm
AC/NFR và các refinement chưa chốt. PASS kỹ thuật local không tự hoàn tất
DoD: peer review độc lập, coverage trước/sau, typecheck riêng, remote CI,
dependency scan sạch và staging còn thiếu. Audit backend dev mới hơn có 19
moderate; production backend/frontend ở audit đã lưu không có phát hiện.

Đã bổ sung phép đo S-11 mới với 500 công việc/2.000 quan hệ: candidate vòng
tối đa 1,639 ms, đạt <500 ms trong bộ nhớ, cùng 3 kiểm thử mới/lint PASS.
Audit hiện ghi nhận 24 PASS/27 PARTIAL về yêu cầu local/refinement; toàn bộ
DoD phát hành vẫn PARTIAL. S-16 đo tính toán local đạt, còn thiếu chứng minh
UI không khóa trên trình duyệt/thiết bị. [Bằng chứng](connectivity/local-ac-performance.json).

## Bằng chứng lịch sử 15/10 — không chạy lại các bộ đã PASS

| Hạng mục | Kết quả |
| --- | --- |
| Hợp nhất/backup/restore/migration/rollback copy | PASS; 9 tài khoản/3 dự án, profile/hash/quyền giữ theo nguồn được duyệt |
| Windows UAT | PASS do chủ hệ thống xác nhận tài khoản cũ, dự án, dữ liệu/menu/quyền |
| Samsung UAT sử dụng chung | PASS theo xác nhận ổn định, không lỗi; không suy ra từng tiêu chí offline |
| PWA cũ/worker/backend Samsung | PASS trực tiếp standalone, bundle mới, merged DB; Super Admin/API 3 dự án |
| Lỗi yêu cầu Chrome | Đã khôi phục sau reboot; log trước đó xác nhận AppsFilter chặn host Chrome |
| Docker Linux + PostgreSQL thử riêng | Build/restore 54 bảng/health/schema/native JPEG-Argon2-PDF PASS |
| Ảnh/session | PostgreSQL BYTEA và PG sessions, không phụ thuộc filesystem ảnh tạm |
| Kiểm thử local | Backend full 374 trước lượt Samsung; targeted 5/5 sau launcher; Frontend 22; Playwright 62 PASS/1 opt-in SKIP, worker riêng PASS; lint/build PASS |
| Cấu hình triển khai | Root Dockerfile, PORT/0.0.0.0, health, Render auto deploy off, Secure cookie/proxy và db:check chỉ đọc đã chuẩn bị |
| An toàn dữ liệu/Git | Hai nguồn giữ nguyên; 43 migration lịch sử, 2 file 021 và backup evidence nguyên hash; root worktree giữ nguyên |

Tại checkpoint 15/10: 3082/4174/4188 đều 200, Docker web running healthy. Ổ C còn
4.79 GiB (5143531520 bytes); database hợp nhất
17520307 bytes. Dung lượng này đủ cho các kiểm tra vừa hoàn tất,
không phải dự báo capacity/backup retention production. [Inventory](final-runtime-inventory.json).

## Những việc còn thiếu trước khi chốt Render

1. **Phiên bản được review và remote CI.** Mã còn local/uncommitted theo yêu
   cầu; Render không nhận được những thay đổi worktree này từ HEAD cũ. Cần
   review, chốt phiên bản và có phép đưa đúng bản lên remote theo quy trình
   chủ hệ thống duyệt; chưa có run remote CI hoặc deployment rollback thực tế.
2. **Staging/cloud PostgreSQL riêng và restore.** Chưa chọn/tạo database cloud,
   cấu hình DATABASE_URL thật hoặc upload backup. Khi được phép, lấy snapshot
   hợp nhất mới nhất, restore vào DB cloud riêng tương thích PG 17, đối chiếu
   toàn bảng/hash/quyền/117 FK/bytes ảnh và chạy db:check. Không trỏ về hai nguồn
   Windows hoặc restore đè nguồn. Không tự migrate khi start/pre-deploy.
3. **HTTPS thực tế.** Chưa kiểm Render TLS, APP_URL thật, Secure/SameSite cookie
   qua TRUST_PROXY, login/RBAC tài khoản cũ, React deep links, ảnh/PDF/PWA trên
   origin HTTPS. Origin HTTPS mới không nhìn thấy offline queue localhost;
   không chuyển hoặc xóa queue cũ tự động.
4. **Tiêu chí Samsung offline chưa đủ bằng chứng.** Chưa ghi nhận riêng camera,
   journal có ảnh qua đóng/mở offline, reconnect/replay/idempotency hoặc sync
   nền khi app đóng; các tài khoản/vai trò khác trên Samsung chưa được liệt kê.
   Theo ưu tiên mới 20/10 đang kiểm tra kết nối và nút Đăng xuất mới trên máy
   thật; không lặp lại các bộ test đã PASS khi code không đổi. Các tiêu chí
   chưa có bằng chứng tiếp tục PARTIAL; không tự gửi queue. API Samsung đang held.
5. **Vận hành.** Backup theo lịch ở staging, lưu ngoài ổ cùng failure domain,
   restore diễn tập và retention chưa chạy thực. App image không có pg_dump/
   pg_restore; cần dịch vụ/runner backup riêng. Monitor app/DB >5 phút và retry/
   recovery đã có test local nhưng chưa có monitor độc lập/kênh team thực tế.
6. **Nghiệm thu còn mở.** NFR WBS/CPM/Gantt trên thiết bị/staging; peer review
   đáp án tính tay; khác biệt S-04 quyền tạo dự án giữa workbook và yêu cầu
   Super Admin; refinement quy trình/S-38 và mẫu PDF chính thức S-50 còn cần
   quyết định/nghiệm thu. Xem audit 51 Story mới ở trên; không tự đổi AC.

Không có quyền deploy production hiện tại. Các bước cloud hoặc mở lại sync cần
được thực hiện trong đúng phạm vi được chủ hệ thống cho phép sau này.
[Hướng dẫn Render](RENDER-HTTPS.md), [báo cáo Sprint 1–8](../FINAL-INTEGRATION-SPRINT1-8.md),
[phản hồi Samsung](samsung-owner-uat.json), [Docker](docker-merged-uat.json).

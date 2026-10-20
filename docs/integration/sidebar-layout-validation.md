# Kiểm chứng sidebar XÂY DỰNG SỐ — 21/10/2026

Worktree `.worktrees/sprint4-5`, nhánh `feature/sprint6-8-integration`.

Nguyên nhân đã xác minh: lần sửa trước bỏ banner trong Members nhưng chỉ build vào `.tmp/sidebar-layout-build`. Hai server local 3082/4174 vẫn phục vụ `.tmp/samsung-pwa-dist`, bundle `index-CnERQdhc.js` còn render banner. Đây là sai lệch giữa bản kiểm thử và bản phục vụ, không phải chỉ CSS hoặc cache trình duyệt. PWA đã có service worker còn giữ shell cũ cho tới khi người dùng đồng ý cập nhật theo luồng hiện hữu.

Đã giữ bản sửa Members.jsx, Members.css, SidebarLogout.css từ lượt trước: xóa banner, Flexbox ba vùng logo/menu/footer, chỉ menu cuộn, chiều cao 100dvh và padding safe-area. Lượt này chỉ dọn thêm footer quảng bá trong legacy WorkItems.jsx và đúng các rule không còn dùng trong WorkItems.css, Operations.css, OperationsPolish.css. App thực tế dùng WorkItemTreePage cho /work-items; không thay menu/handler. Tìm toàn bộ frontend/src không còn node hoặc CSS quảng bá. Cây construction-management-main là bản sao không được App/build hiện tại import và không được sửa.

Bổ sung frontend/tests/sidebar-layout.spec.js và frontend/playwright.sidebar-layout.config.js. Mỗi lượt kiểm tra tên/URL menu, logo, không banner, không spacer, scroll đầu/cuối menu, header/footer không dịch chuyển, nút Đăng xuất đầy đủ trong viewport và nhận click thử, không chồng lấn. Từng trang được truy cập từ Members rồi quay về Members. API bị mock, mọi yêu cầu ghi bị chặn; không dùng dữ liệu hoặc tài khoản thật.

| Trang | Desktop 1366×650 | Mobile 411×808 | Ngang 915×411 |
|---|---|---|---|
| Tổng quan (/home) | PASS | PASS | PASS |
| Dự án (/projects) | PASS | PASS | PASS |
| Thành viên & phân quyền (/members) | PASS | PASS | PASS |
| Cây hạng mục (/work-items) | PASS | PASS | PASS |
| Tiến độ & đường găng (/schedule) | PASS | PASS | PASS |
| Lịch làm việc (/calendar) | PASS | PASS | PASS |
| Giao việc hiện trường (/field-assignments) | PASS | PASS | PASS |
| Nhật ký công trường (/site-journal) | PASS | PASS | PASS |
| Nghiệm thu khối lượng (/acceptance) | PASS | PASS | PASS |
| Thanh toán (/payments) | PASS | PASS | PASS |
| Chi phí & vật tư (/costs-materials) | PASS | PASS | PASS |
| Ảnh hiện trường (/site-photos) | PASS | PASS | PASS |
| Báo cáo (/reports) | PASS | PASS | PASS |
| Thông báo (/notifications) | PASS | PASS | PASS |
| Nhật ký hệ thống (/audit-logs) | PASS | PASS | PASS |
| Cài đặt (/settings) | PASS | PASS | PASS |
| Quản trị hệ thống (/system-admin) | PASS | PASS | PASS |

51/51 lượt theo trang và viewport PASS. 24/24 lượt phân quyền PASS (admin, manager, project_manager, engineer, worker, accountant, viewer và super_admin × 3 viewport); giữ nguyên chính sách menu riêng đang có của Members và Dashboard.

PWA: 1 ca production shell đang được service worker điều khiển đi qua 16 trang dự án PASS. 1 ca nâng PWA cũ sang mới trên origin thử nghiệm riêng PASS: thấy banner cũ trước cập nhật, bấm Cập nhật ứng dụng theo luồng thật, bundle/cache đổi, Members sạch banner và nhật ký cùng từng byte ảnh IndexedDB vẫn giữ nguyên. Hai ca PWA chỉ chạy ở mobile; 4 biến thể desktop/landscape được bỏ qua có chủ đích. Tổng 77 PASS, 4 SKIP, 0 FAIL, 0 FLAKY. Đây là mô phỏng Chrome mobile/PWA; chưa phải Note20 Ultra vật lý hoặc WebAPK đã cài.

Lint và build PASS. Bản build sạch `.tmp/sidebar-complete-build` đã được đưa đúng vào thư mục local đang phục vụ, có backup riêng, giữ mọi asset hash cũ, không xóa file. Không khởi động lại server. Cả 3082 và 4174 hiện trả bundle `index-gtp0NSj_.js`, hash đúng build đã kiểm thử; JS mới không có banner. Nút/sidebar Members được kiểm tra thêm trên chính hai cổng, desktop và mobile: 4/4 PASS, API vẫn mock.

Hash của DashboardLayout, SidebarLogout, journalOffline, journal-queue, journal-sw nguồn và các file Backend/session được bảo toàn. Không migration, DB write, auth API thật, đồng bộ Samsung, truy cập storage thiết bị, commit/push/merge hoặc deploy production. Samsung business writes vẫn HELD_FOR_OFFLINE_REVIEW.

PARTIAL: PWA/Chrome đang mở từ trước có thể còn worker cũ chờ đồng ý. Dùng Tổng quan → Cập nhật ứng dụng sau khi lưu/đóng biểu mẫu, theo luồng có sẵn; không xóa dữ liệu trình duyệt. Note20 Ultra thực tế cần chủ thiết bị xác nhận. Runtime metadata Samsung vẫn ghi hash worker lúc khởi động; bytes worker phục vụ đã đối chiếu riêng. Vì không restart hoặc đổi gate, công cụ recovery có thể báo lệch hash metadata; không dùng kết quả đó thay cho xác minh HTTP.

Lệnh đã chạy: npm --prefix frontend run lint; npm --prefix frontend run build -- --outDir ../.tmp/sidebar-complete-build; node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.sidebar-layout.config.js --max-failures=3. Ca nâng PWA dùng artifact lịch sử .tmp/logout-resume-build sẵn có; bộ này không chạy lại unit/auth logout đã PASS ở checkpoint trước.

Bằng chứng local: [.tmp/sidebar-complete-playwright.json](../../.tmp/sidebar-complete-playwright.json), [HTTP trước/sau](../../.tmp/sidebar-served-build-verification.json), [4 lượt UI đúng cổng đang phục vụ](../../.tmp/sidebar-served-ui.json), [hash logic bảo toàn](../../.tmp/sidebar-ui-protected-verification.json).

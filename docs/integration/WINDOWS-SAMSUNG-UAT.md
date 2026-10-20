# Kiểm thử bản hợp nhất trên Windows và Samsung Android

Cập nhật 20/10/2026. Database chuẩn để UAT: construction_merged_copy_1792015129032.
Giữ hai nguồn, các bản sao đối chiếu và backup. Không tự migrate/seed/reset,
đổi mật khẩu/quyền, xóa dữ liệu offline, commit/push/merge hoặc deploy production.

Ngày 20/10 đã khôi phục host 3082/4174 sau khi không còn listener; cả hai đang
phục vụ bundle logout `index-CnERQdhc.js`, health PASS, Samsung gate held.
ADB hiện chưa thấy thiết bị; địa chỉ Wi-Fi ngày 15/10 dưới đây là lịch sử,
không dùng như địa chỉ hiện tại. Xem [checkpoint mới và bằng chứng](connectivity/README.md).

Lệnh khôi phục ưu tiên, chỉ khởi động server còn thiếu và đặt reverse khi đã
xác minh đúng Samsung kết nối:

~~~powershell
npm --prefix backend run pwa:recover -- --windows
~~~

Kết quả PARTIAL/exit2 nghĩa là host đã kiểm tra nhưng còn thiếu thiết bị.
Kết nối USB hoặc dùng IP:cổng Wireless Debugging hiện tại đã ghép đôi; không
pair lại hoặc xóa keys. Xác minh login/menu/đăng xuất thật đang chờ thiết bị
và tài khoản cũ; các UAT PASS phía dưới là bằng chứng 15/10, không phải lượt
kiểm tra lại ngày 20/10. Không tự đồng bộ.

## Windows — chủ hệ thống đã xác nhận PASS

Địa chỉ **http://localhost:3082/login**. Chủ hệ thống xác nhận đăng nhập Super
Admin/tài khoản cũ, 3 dự án, dữ liệu, menu và phân quyền đúng. Không suy ra từng
email đã thử. [Biên bản](windows-merged-uat.json).

Nếu server đã dừng, chạy tại worktree:

~~~powershell
Set-Location D:\Project\construction-management-new\.worktrees\sprint4-5
npm --prefix backend run start:verified-copy -- --source=merged --port=3082
~~~

Build hiện có; không rebuild đè dist khi người dùng đang kiểm tra. Launcher
không sửa .env, không migrate/seed. 3080/3081 là copy đối chiếu lịch sử.

## Samsung — giữ PWA và origin localhost:4174

Dùng **PWA đã cài trước đây**, Chrome com.android.chrome, Android user 0,
start URL **http://localhost:4174/site-journal**. Không đổi sang IP LAN/port khác
để tìm dữ liệu offline: IndexedDB gắn với origin. Không Clear storage/cache,
unregister worker, gỡ/cài lại PWA hoặc xóa dữ liệu Chrome.

Server riêng backend/scripts/samsung-pwa.cjs phục vụ production shell
.tmp/samsung-pwa-dist, cùng database hợp nhất 9 tài khoản/3 dự án. Bind cả
127.0.0.1 và ::1. /__samsung/runtime cung cấp định danh copy/build/gate, không
chứa secret. Nếu server đã dừng, chạy từ worktree:

~~~powershell
node backend/scripts/samsung-pwa.cjs
~~~

Không cần build lại các mã đã PASS: bundle host mới là index-CnERQdhc.js;
worker trên điện thoại chưa được kiểm tra/cập nhật ở lượt này. Restart server tự đưa gate về held; không
chạy hai process tranh cổng 4174. PWA localhost là secure context đã xác minh
trên Samsung; truy cập IP LAN HTTP không thay thế ca kiểm thử này.

Kết nối Wi-Fi lịch sử sau reboot ngày 15/10 là **192.168.2.32:42265**; ngày 20/10
địa chỉ này timeout. Luôn chọn -s vì cùng một máy
có thể xuất hiện qua hai transport. Cổng Wireless Debugging có thể đổi:

Chạy `adb devices -l` để lấy serial USB hoặc cung cấp IP:cổng Wi-Fi thật cho
`pwa:recover -- --windows --connect=IP:PORT --serial=IP:PORT` sau khi thay giá
trị thật; công cụ tự xác minh model và mapping. Không chạy lại địa chỉ lịch sử.

Không xóa ADB keys hoặc tự ghép đôi lại. Reboot/mất kết nối có thể làm mất reverse;
khôi phục reverse trước khi mở app. [ADB proof](samsung-adb-verification.json).

## Các bước đã hoàn tất trên điện thoại thật

Chrome mở được origin cũ, fetch runtime đúng merged copy. Người dùng bấm Cập
nhật ứng dụng; worker mới activated, không còn waiting worker, bundle/cache
khớp build. IndexedDB xds-journal version 2 trước/sau: 0 nhật ký chờ gửi,
0 ảnh offline; 2 cache rows/3 control rows và toàn bộ dữ liệu stores giống nhau.
Checkpoint riêng trên D trong .private, không công khai nội dung auth/cache.
[Update proof](samsung-worker-update.json).

Biểu tượng WebAPK cũ từng báo cần Chrome dù Chrome cài/bật/chạy được. Logcat
xác nhận AppsFilter chặn WebAPK → com.android.chrome. Chủ máy đã reboot và xác nhận PWA cũ mở lại được. Đã kiểm chứng standalone,
worker/build, merged backend, session Super Admin và đủ 3 dự án. Launcher
recovery PASS. Chủ máy xác nhận sử dụng ổn định, không lỗi: UAT sử dụng chung
PASS; camera/offline/reconnect chưa có bằng chứng riêng và không yêu cầu lặp lại.
[Biên bản UAT](samsung-owner-uat.json).
[Log nguyên nhân](samsung-webapk-targeted-log.json).

## Các tiêu chí còn thiếu bằng chứng

Theo ưu tiên mới 20/10, kiểm tra kết nối và nút Đăng xuất mới được yêu cầu trực
tiếp. Không chạy lại các bộ test đã PASS khi code không đổi. Các ca camera,
offline/reconnect/background sync còn thiếu bằng chứng bên dưới tiếp tục là
tài liệu tham khảo; không tự bật sync hoặc tạo/xóa dữ liệu để hoàn tất chúng.

1. Mở biểu tượng cũ; nếu còn yêu cầu Chrome, giữ hộp thoại và báo lại. Không bấm
   cài đặt/gỡ/xóa dữ liệu. Nếu mở được, giữ màn hình sáng để xác minh đúng build.
2. Đăng nhập tài khoản cũ trên máy; không gửi mật khẩu/token. Kiểm tra đúng dự
   án và menu. Super Admin có cả 3 dự án; tài khoản thường chỉ thấy memberships.
3. Ghi nghiệp vụ hiện HELD theo yêu cầu không tự đồng bộ sau UAT chung. Chỉ
   mở lại khi một pha sync được cho phép và queue được kiểm kê:

   ~~~powershell
   node backend/scripts/samsung-pwa.cjs --enable-sync --offline-source-reviewed
   ~~~

   Đây không phải bypass Auth/RBAC; app vẫn dùng session và quyền thật. Không
   tự chạy command trước khi xem lại runtime/build và hàng đợi hiện tại.
4. Chọn dự án/hạng mục được phép thử, chụp một ảnh không nhạy cảm, tạo nhật ký
   có nhãn UAT. Để thử offline trong khi dùng ADB Wi-Fi, giữ Wi-Fi/USB debugging
   hoạt động; người vận hành có thể tạm dừng đúng listener server 4174 sau khi
   trang đã tải, thay vì tắt Wi-Fi làm mất ADB. Không xóa cache/IDB hay server 3082.
5. Lưu offline, kiểm tra queue/ảnh, reload/đóng mở vẫn còn. Mở lại đúng server,
   xác minh database và gate rồi reconnect/sync. Kiểm tra đúng tác giả/dự án,
   ảnh gốc/thumbnail, trạng thái queue và không nhân đôi khi gửi lại.
6. Kiểm tra đổi tài khoản không lộ queue của người khác; thao tác ngoài quyền
   bị từ chối. Ghi kết quả từng vai trò thực tế; fixture PASS không thay UAT.
7. Phân biệt foreground replay với background sync khi app đóng. Chưa có bằng
   chứng nền trên Samsung thì ghi PENDING; không suy từ desktop Playwright.

Dữ liệu snapshot: 9 users, 3 projects, 4 items, 14 tasks, 13 memberships,
4 journals/6 photos. UAT có thể tăng dữ liệu copy. Nguồn tài chính đang rỗng;
nghiệm thu/thanh toán/concurrency được test trên fixture DB riêng, không tạo
hồ sơ mẫu vào nguồn để làm đẹp số đếm. [Account sources](ACCOUNT-SOURCES.md).

## Docker và Render

Docker local **http://localhost:4188/login** dùng PostgreSQL container/volume
riêng, restore snapshot hợp nhất đã đối chiếu 54 bảng. Build/health/native media
PASS, không trỏ app Docker vào PG Windows. Giữ container/volume để review.
[Docker proof](docker-merged-uat.json).

Render HTTPS chưa deploy. Không chuyển các queue localhost sang origin HTTPS
mà không sao lưu và xử lý riêng; origin mới không tự nhìn thấy IndexedDB cũ.
[Chuẩn bị Render](RENDER-HTTPS.md).

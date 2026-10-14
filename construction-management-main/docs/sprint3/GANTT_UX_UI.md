# Gantt UX/UI — 2026-10-06

Đã refactor Schedule thành màn hình tiến độ thi công: header → KPI → bộ lọc → timeline → bảng CPM thu gọn. Click thanh/tên mở drawer; cập nhật tiến độ thực hiện trong drawer. Dùng navy/blue/orange và font Segoe UI tương thích homepage; không thêm thư viện, không sửa homepage hoặc header/sidebar toàn cục.

## Giao diện và tương tác

- Header “Tiến độ dự án”, mã dự án, trước/sau, Hôm nay, Ngày/Tuần/Tháng và thêm công việc.
- KPI lấy dữ liệu thật: tiến độ có trọng số thời lượng, số việc đạt 100%, nguy cơ trễ/quá hạn và số việc găng. Dữ liệu chưa có hiển thị `—`.
- Search không phân biệt dấu tiếng Việt; lọc trạng thái, người phụ trách khi có dữ liệu, công việc găng. Lọc ở frontend để giữ KPI toàn dự án và tỷ lệ timeline; không đổi kết quả CPM.
- Nhóm theo hạng mục thật, tên có đường dẫn hạng mục cha; mở/đóng từng nhóm, thu gọn tất cả, hiện tất cả và xóa bộ lọc.
- Cột tên/header sticky, timeline cuộn ngang, dòng 44 px, hover/selected. Thanh có progress đậm/nhạt và nhãn; công việc găng có outline và ký hiệu riêng.
- Milestone là diamond khi dữ liệu có cờ milestone hoặc ES = EF. Không thêm loại task mới vào backend; form tạo task vẫn yêu cầu thời lượng nguyên dương.
- Dependency từ API hiện có: arrow FS/FF/SS/SF, đi qua khoảng giữa hàng và highlight khi hover/chọn. Không suy đoán hoặc thay đổi quan hệ.
- Drawer chi tiết bên phải; mobile toàn màn hình. Có kế hoạch, thực tế, progress, người phụ trách khi có dữ liệu, thời lượng, float, ES/EF/LS/LF và công việc trước/sau.
- Edit progress giữ xác nhận mở lại việc 100%, kiểm tra phần trăm nguyên 0–100, ngày thật và thứ tự ngày. Chỉ cập nhật thanh/KPI/drawer sau API thành công. Lỗi API giữ form và thông báo; đang lưu chặn submit/đóng drawer.
- Thêm/chỉnh sửa tái sử dụng TaskForm và API task/dependency. Sau đổi thời lượng/phụ thuộc, lấy lại schedule để backend thực hiện CPM hiện có; không tính lại các mốc ở frontend.
- Bảng CPM đủ trường nằm trong “Chi tiết đường găng”, mặc định đóng; dòng găng có viền trái và badge nhẹ.
- Có skeleton KPI/task/timeline, empty state, lỗi API và retry. Endpoint phụ lỗi không che timeline.
- Sửa tooltip FocusEvent có tọa độ NaN, tooltip bị đóng khi focus tự cuộn và tooltip nhận mất click thanh. Tooltip hỗ trợ hover/focus, Escape và click ngoài.

## Ngày lịch và dữ liệu thiếu

API schedule hiện trả ngày tương đối ES/EF; schema task chưa có ngày khởi công hay người phụ trách. Không tự đặt ngày khởi công hoặc tạo dữ liệu người phụ trách/task giả trong sản phẩm.

“Gắn lịch dự án” cho chọn ngày khởi công làm Ngày 0 cho **chế độ xem**. Lưu theo project trong localStorage trên máy người dùng, không ghi API/database. Khi có mốc này: ngày/thứ, shading cuối tuần và Hôm nay theo múi giờ Việt Nam. Khi chưa có mốc: Ngày N/Tuần N, Hôm nay vô hiệu hóa; Tháng tương đối dùng quy ước 30 ngày và có chú thích. Khi đã gắn lịch, Tháng theo tháng lịch thật, bao gồm tháng 2 năm nhuận.

Chỉ báo trễ là thông tin hiển thị: so phần trăm thực tế với tiến độ tuyến tính giữa ES–EF theo mốc người dùng chọn; quá EF và chưa đạt 100% hiển thị Trễ. Không sửa trạng thái server, float, đường găng hoặc CPM. Chọn mốc khởi công khác có thể thay đổi chỉ báo.

Ngày thực tế hỗ trợ cả date-only và Date ISO từ API; chuẩn hóa sang ngày lịch Việt Nam để drawer/date input nhất quán. Body gửi progress vẫn là date-only.

Không thêm drag/resize: Gantt hiện tự viết, chưa có library hỗ trợ; kế hoạch hiện dùng duration/dependency thay vì ngày độc lập. Chỉnh sửa qua drawer/form hiện có theo yêu cầu giữ CPM.

## File sửa và component tạo

| File sửa | Mục đích |
| --- | --- |
| `frontend/src/pages/Schedule.jsx` | Bố cục, state, dữ liệu hỗ trợ, filter, drawer và lưu |
| `frontend/src/styles/Schedule.css` | Trang/KPI/toolbar/drawer/skeleton/responsive |
| `frontend/src/features/gantt/Gantt.jsx`, `gantt.css` | Grid, nhóm, thanh, dependency, marker, tooltip/navigation |
| `frontend/src/features/gantt/GanttTooltip.jsx` | Tooltip trạng thái/milestone và mốc CPM |
| `frontend/src/features/gantt/ActualProgressForm.jsx` | Form drawer, ngày hợp lệ và đang lưu |
| `frontend/src/features/gantt/barModel.js` | Giữ CPM, thêm trường hiển thị và chuẩn hóa ngày |
| `frontend/src/features/gantt/timeScale.js` | Tháng/origin lịch; giữ công thức tọa độ |
| `frontend/src/services/taskApi.js`, `workItemApi.js` | Thêm AbortSignal cho GET; không đổi URL/body |
| `frontend/vite.config.js` | Tách HTTP client, bỏ cảnh báo chunk >500 kB |
| `frontend/package.json`, `playwright.config.js`, `.gitignore` | Lệnh unit/preview và cấu hình kiểm thử |
| `frontend/tests/gantt.spec.js`, `schedule.spec.js`, `gantt-unit.test.mjs` | Regression tương thích UX mới, giữ tiêu chí CPM/progress |

Component/helper/config/test mới:

- `frontend/src/features/gantt/ScheduleControls.jsx`: icon, KPI, toolbar, legend, skeleton, mốc lịch.
- `frontend/src/features/gantt/TaskDetailsDrawer.jsx`: chi tiết và edit progress.
- `frontend/src/features/gantt/scheduleViewModel.js`: filter/group/KPI/chỉ báo/ngày; không sửa nguồn.
- `frontend/tests/schedule-ux.spec.js`, `schedule-view-model.test.mjs`: kiểm chứng UX và helper.
- `frontend/playwright.preview.config.js`: kiểm thử trên production build.

TaskForm.jsx, scheduleApi.js, progressApi.js và logic backend được tái sử dụng nguyên trạng trong phiên này. Working tree ban đầu đã có thay đổi Sprint 3 ở backend và App.jsx; không hoàn tác hoặc sửa các thay đổi đó. Đã đối chiếu SHA256 toàn bộ backend/src và backend/tests trước/sau: không khác biệt.

## API giữ nguyên

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/projects/:projectId/schedule` | CPM/tiến độ |
| GET | `/projects/:projectId/tasks` | Thông tin task cho form |
| GET | `/projects/:projectId/items` | Nhóm và hạng mục lá |
| GET | `/projects/:projectId/dependencies` | Arrow và quan hệ drawer |
| PATCH | `/projects/:projectId/tasks/:taskId/progress` | `{ actualStart, actualEnd, percentComplete }` |
| POST / PATCH | `/projects/:projectId/tasks[/:taskId]` | Tên/hạng mục/thời lượng |
| POST / DELETE | Các endpoint dependency hiện có | TaskForm |

Không tạo endpoint, sửa backend/database hay chạy migration. Không ghi dữ liệu production khi kiểm thử.

## Kiểm chứng

- Frontend lint: pass.
- Frontend production build: pass, không có cảnh báo >500 kB; chunk lớn nhất khoảng 489,64 kB.
- Unit: **12 pass, 0 fail** — ba mốc tính tay, ngày/tuần/tháng, năm nhuận, ngày sai, origin bất biến, dữ liệu thiếu, filter/group, bảo toàn CPM và ISO/date-only theo Việt Nam.
- Browser regression dev: **23 pass, 0 fail** — gồm tests task/dependency cũ, 500 task, validation, lỗi/lưu progress, xác nhận mở lại, critical flag, đổi đơn vị và keyboard tooltip. Lượt này trước bổ sung chuẩn hóa ISO; phần ISO được unit và suite production kiểm tra.
- Browser UX production build: **7 pass, 0 fail** — KPI/grid/weekend/today/milestone/FS/FF/SS/SF, filter/collapse, drawer/save, điều hướng/sticky, mobile 390 × 844, create/edit, endpoint phụ lỗi. Fixture có actualStart ISO; form vẫn gửi date-only đúng.
- Các ca UX có assertion pageerror/console error không phát hiện lỗi. Đã xem trực tiếp ảnh desktop/mobile.
- Backend regression: **126 pass, 28 skipped, 0 fail**; suite PostgreSQL skipped do chưa cấu hình DB kiểm thử.

Browser tests dùng API mock đúng contract, không dùng dữ liệu production. Chưa kiểm thử end-to-end với session/API/database thật và điện thoại vật lý; mobile là viewport browser mô phỏng. Trên Windows, runner chờ teardown Vite sau các test; đã dừng đúng server từng lượt khởi tạo để lấy summary.

## Ảnh kiểm thử

Ảnh dùng fixture test, không phải dữ liệu production:

- [Desktop](gantt-ui/desktop.png).
- [Mobile](gantt-ui/mobile.png).
- [Timeline mobile khi cuộn](gantt-ui/mobile-timeline.png).
- [Drawer mobile](gantt-ui/mobile-drawer.png).

## Chạy lại

Trong frontend:

```powershell
npm.cmd run dev
npm.cmd run lint
npm.cmd run test:unit
npm.cmd test -- --reporter=line
npm.cmd run build
npm.cmd run test:preview -- --reporter=line
```

Mở `/schedule?projectId=<id>` với backend và session hiện có để dùng dữ liệu thật. Không cần package mới. Chưa commit/push.

# Kiểm tra T-30 — 2026-10-06

**Kết luận ban đầu:** chức năng chính của module/component đã làm được và tính đúng với dữ liệu hợp lệ, nhưng trang Schedule chưa có thao tác đổi đơn vị, trục ngày bị chồng nhãn ở khoảng dài, và scale xử lý sai đầu vào ngày cùng Date có thể bị thay đổi từ bên ngoài.

Các phát hiện ban đầu dưới đây đã được sửa trong đợt follow-up 2026-10-06; xem mục **Kết quả sửa lỗi follow-up** cuối tài liệu. Lần chạy kiểm chứng sau sửa chưa khởi động được vì môi trường trả `Access is denied. (os error 5)` cho cả Node và npm.

## Đối chiếu yêu cầu trong bảng task

| Yêu cầu | Bằng chứng | Kết quả |
| --- | --- | --- |
| Hàm đổi ngày sang tọa độ ngang theo tỷ lệ | `frontend/src/features/gantt/timeScale.js`; kiểm tra số và ngày lịch, độ rộng và origin khác 0 | Đạt với đầu vào hợp lệ |
| Vẽ vạch và nhãn ngày/tuần | `Gantt.jsx` lấy header và gridline thân từ cùng `scale.ticks` | Đạt |
| Đổi đơn vị thì vạch và nhãn đổi theo | Schedule có nút Ngày/Tuần nối vào `Gantt.unit`; test browser kiểm tra nhãn đổi và thanh không dịch vị trí | Đã bổ sung |
| Module riêng, hàm tọa độ không chạm DOM | `timeScale.js` không có React, document, window hay thao tác DOM; Gantt tiêu thụ scale | Đạt |
| Có test với ba mốc tính tay | Unit test kiểm tra `0, 7, 14 ngày → 0, 350, 700 px` | Đã bổ sung vào test module |

Component và trang Schedule đều hỗ trợ đổi Ngày/Tuần; phần sửa giữ nguyên tọa độ thanh khi chuyển đơn vị và chỉ giảm mật độ nhãn để tránh chồng lấn.

## Các vấn đề đã tái hiện trước khi sửa

### 1. Trang Schedule luôn dùng ngày, chưa có điều khiển đổi tuần

- `frontend/src/pages/Schedule.jsx:101` gọi `<Gantt tasks={state.schedule} onBarSelect={setSelectedBar} />`, không truyền `unit` hay giữ state đơn vị.
- `frontend/src/features/gantt/Gantt.jsx:37` mặc định `unit = "day"`.
- Browser test xác nhận không có select, nút, radio hoặc tab chọn Tuần trên trang.
- Cần bổ sung điều khiển và nối `unit` nếu mục tiêu là đổi đơn vị trực tiếp trong ứng dụng. Sau đó test thao tác ngày → tuần → ngày trên trang thực tế, đồng thời xác minh vạch/nhãn và vị trí thanh.

### 2. Đầu vào ngày không hợp lệ bị chấp nhận và âm thầm thay bằng range mặc định

- `frontend/src/features/gantt/timeScale.js:96` dùng fallback `?? Number(end)` khi không phân tích được ngày kết thúc; `end` mặc định là 1.
- Ví dụ `createTimeScale({ startDate: "2024-02-28", endDate: "2024-02-30", width: 300 })` không throw. Scale nhận `duration = 1` và vẽ nhãn `28/02, 29/02`, dù ngày kết thúc không tồn tại.
- `endDate: "bad-date"` cũng bị nhận. Khi cả hai chuỗi biên đều sai, hàm quay về range số 0–1 thay vì báo lỗi.
- Ba ca review fail. Đây là vấn đề của contract ngày trong module dùng chung; Schedule hiện dùng range số nên các ca này chưa chứng minh lỗi phát sinh trên đường đi mặc định của trang.
- Cần phân biệt đầu vào bị bỏ trống với đầu vào được cung cấp nhưng sai, reject rõ ràng và thêm regression test cả biên đầu/cuối.

### 3. Scale không bất biến khi origin là đối tượng Date

- `frontend/src/features/gantt/timeScale.js:94` giữ tham chiếu `startDate` gốc; `timeToX` đọc lại nó trong mỗi lần gọi.
- Tạo scale bằng `startDate = new Date("2024-01-01T00:00:00Z")`, `endDate = "2024-01-11"`, `width = 100`: ngày `2024-01-06` cho `x = 50`.
- Sau `startDate.setUTCDate(2)`, cùng giá trị đó cho `x = 40`, trong khi ticks đã tạo không đổi. Bề ngoài `Object.freeze(scale)` không ngăn được tình huống này.
- Cần chụp giá trị origin bất biến khi tạo scale; test sửa đối tượng Date bên ngoài rồi xác minh tọa độ và ticks vẫn nhất quán.

### 4. Nhãn trục bị chồng ở khoảng dài

- Với `start=0, end=90, width=1200, unit="day"`, mỗi ngày chỉ cách khoảng 13,33 px, nhưng vẫn render đầy đủ nhãn `Ngày N`.
- Browser đo được 90 cặp nhãn liền kề chồng nhau; đã kiểm tra ảnh chụp.
- CSS liên quan: `frontend/src/features/gantt/gantt.css:9`; nơi render nhãn: `Gantt.jsx:95`.
- Cần điều chỉnh độ rộng theo số ngày hoặc giảm mật độ nhãn theo không gian thực tế. Giữ tọa độ vạch và thanh nhất quán khi đổi đơn vị.
- [Ảnh trục 90 ngày](t30-review/browser-results/browser-T-30-90-day-labels-e1278-e-application-s-fixed-width/90-day-axis.png).

## Kết quả chạy ở lượt review trước khi sửa

| Kiểm tra | Kết quả |
| --- | --- |
| Unit test gốc `frontend/tests/gantt-unit.test.mjs` | 3 pass, 0 fail |
| Frontend ESLint | Pass |
| Frontend production build | Pass, không có cảnh báo bundle lớn |
| Toàn bộ Playwright frontend đang có | 14 pass, 0 fail |
| 12 kiểm tra scale mở rộng | 8 pass, 4 fail |
| Cùng 12 kiểm tra với `TZ=America/Los_Angeles` | 8 pass, 4 fail, cùng các lỗi |
| Cùng 12 kiểm tra với `TZ=Asia/Ho_Chi_Minh` | 8 pass, 4 fail, cùng các lỗi |
| Browser riêng cho T-30 | 2 pass, 2 fail |

Hai browser test pass: đổi day/week trên component thật với range số ở desktop, và range lịch qua tháng/năm nhuận ở viewport 390 × 844. Hai test fail: không có điều khiển Tuần trên Schedule và nhãn 90 ngày chồng nhau.

Các kiểm tra pass còn bao gồm năm nhuận, ngày qua ranh giới DST, mốc qua năm mới, offset lẻ, origin số khác 0, tọa độ ngoài range, wrapper `timeToX`/`durationToWidth`, width/range/unit không hợp lệ. Công thức được đối chiếu bằng các mốc tính tay, không chỉ so sánh hai lần gọi cùng một hàm.

Browser tests mock API schedule để tập trung vào T-30; không kiểm tra database hay API thật. Mobile là mô phỏng viewport, không phải điện thoại thật. Một lần chạy các test hiện có và một lần kiểm tra bổ sung có thể tái hiện lỗi, nhưng không chứng minh mọi môi trường đều ổn định.

Playwright trên Windows bị chờ ở bước dừng Vite sau khi test chạy xong; đã dừng đúng các tiến trình Vite do phiên kiểm tra khởi tạo để lấy summary. Thời gian suite có phần chờ teardown, không phải phép đo hiệu năng ứng dụng.

Ngoài phạm vi T-30: các test Gantt cũ vẫn pass nhưng log React báo `NaN` cho CSS `left` của tooltip khi focus. `Gantt.jsx:16` dùng `event.clientX`; FocusEvent không cung cấp tọa độ đó. Nên xử lý và kiểm tra riêng cho T-33; không dùng 14 test pass để kết luận tooltip đã hết lỗi.

## Kết quả sửa lỗi follow-up — 2026-10-06

- Thêm nút chọn Ngày/Tuần ngay trên Gantt trong Schedule; unit được truyền xuống component và có trạng thái `aria-pressed`.
- Giữ tất cả gridline theo tick nhưng chỉ render nhãn cách đủ xa để tránh chồng chữ; tọa độ thanh không phụ thuộc mật độ nhãn.
- Từ chối date range nếu một trong hai biên là chuỗi/Date không hợp lệ; không fallback sang `start`/`end` số.
- Scale lưu timestamp gốc đã chuẩn hóa, nên mutate đối tượng `Date` truyền vào sau đó không làm thay đổi `timeToX`.
- Bổ sung regression unit cho ba mốc tính tay, ngày sai và Date mutation; bổ sung browser checks cho đổi đơn vị trên Schedule và nhãn khoảng 90 ngày.
- Cố chạy lại unit, lint và browser tests nhưng cả lệnh Node/npm đều bị môi trường chặn với `Access is denied. (os error 5)`; các kết quả trước sửa trong bảng phía trên không đại diện cho lần chạy code mới.

## Chạy lại và dữ liệu bằng chứng

Từ thư mục `frontend`:

```powershell
node --test tests/gantt-unit.test.mjs
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --reporter=line
node node_modules/@playwright/test/cli.js test --config ../docs/sprint3/t30-review/playwright.config.mjs
```

Từ thư mục gốc:

```powershell
node docs/sprint3/t30-review/scale-check.mjs
$env:TZ = 'America/Los_Angeles'
node docs/sprint3/t30-review/scale-check.mjs
$env:TZ = 'Asia/Ho_Chi_Minh'
node docs/sprint3/t30-review/scale-check.mjs
Remove-Item Env:TZ
```

Các bộ review cố ý exit 1 khi phát hiện kỳ vọng chưa đạt; không phải lỗi cài đặt. Script scale ghi JSON ngay cạnh file. Script browser dùng dependencies/browser Playwright sẵn có của frontend, không cần thêm package.

- [Bộ kiểm tra scale](t30-review/scale-check.mjs).
- [Kết quả scale mặc định](t30-review/scale-results-default.json).
- [Kết quả America/Los_Angeles](t30-review/scale-results-America-Los_Angeles.json).
- [Kết quả Asia/Ho_Chi_Minh](t30-review/scale-results-Asia-Ho_Chi_Minh.json).
- [Browser tests](t30-review/browser.spec.mjs) và [cấu hình](t30-review/playwright.config.mjs).
- [Kết quả browser JSON](t30-review/browser-results.json); thư mục `browser-results/` có ảnh và trace của hai test fail.

Chưa tích hợp các test review vào script/CI sản phẩm. `frontend/package.json` chưa khai báo riêng `test:unit`, còn `.github/workflows/ci.yml` chỉ chạy backend. Sau khi sửa, nên đưa regression của T-30 vào test frontend và CI để các lần thay đổi tiếp theo được kiểm tra tự động.

**Trạng thái sau follow-up:** các phát hiện cụ thể trong review đã được xử lý và có regression tests. Chưa xác nhận được kết quả chạy tests sau sửa do lỗi quyền khởi chạy Node/npm nêu trên; chưa nên ghi nhận test pass cho tới khi chạy lại thành công.

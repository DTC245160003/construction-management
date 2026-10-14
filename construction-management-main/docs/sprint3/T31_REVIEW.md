# T-31 — kiểm tra và hoàn thiện, 2026-10-06

Đã sửa các phần thiếu trong frontend và kiểm chứng lại: thanh lấy tọa độ từ T-30, cột tên/header cố định khi cuộn, lịch 500 công việc sử dụng render theo vùng nhìn, và thông báo vòng phụ thuộc được hiển thị khi chưa có kết quả. Giữ nguyên ES/EF/LS/LF, float, critical flag, API/backend/database.

**Chưa thể xác nhận tiêu chí trên điện thoại tầm trung vật lý.** Kết quả mobile dưới đây là Chromium mô phỏng 390 × 844, DPR 3, CPU slowdown 4 lần. Đã chuẩn bị trang thử độc lập để thực hiện bước kiểm tra thiết bị thật.

## Phát hiện và sửa

1. **Cycle message biến mất khi tasks rỗng:** `Gantt` trả empty state trước khi render `cycleMessage`. Đã ưu tiên thông báo lỗi vòng và không vẽ lịch giả khi có vòng. Test component và test Schedule nhận HTTP 422 đều kiểm tra thông báo có tên công việc.
2. **Vạch 4 px gây sai vị trí:** task thiếu ES/EF, EF < ES hoặc nằm hoàn toàn ngoài range vẫn được đặt ở Ngày 0/biên range. `barGeometry.js` chỉ dùng T-30 để quy đổi, kẹp phần giao với range và không vẽ thanh giả. Task chưa có mốc vẫn giữ dòng tên và thao tác mở chi tiết; milestone ở biên được giữ đúng tọa độ.
3. **500 task luôn dựng toàn bộ hàng:** test cũ chỉ đếm 500 DOM nodes, không chứng minh vị trí hoặc khả năng cuộn. Lịch >100 hàng giờ render quanh viewport với 8 hàng đệm ở mỗi phía; giữ chiều cao logic và ID/index gốc, dùng requestAnimationFrame và ResizeObserver. Bộ 500 task trong bài đo chỉ có khoảng 29 hàng đang dựng, vẫn cuộn đến hàng 500 và truy cập từng công việc.
4. **Lặp việc dựng trục/grid khi cuộn:** cache header/vạch/weekend, cập nhật cửa sổ theo khối 4 hàng; lớp grid và dependency chỉ vẽ phần dọc cần thiết. Geometry dependency vẫn dùng index toàn bộ danh sách nên không lệch khi cuộn/thu gọn.
5. **Bảng CPM thu gọn vẫn dựng toàn bộ ô:** chỉ mount Table khi mở “Chi tiết đường găng”. Các trường và thao tác chọn dòng được giữ nguyên.

Các test trước phiên sửa này (Gantt/Schedule hiện có) đã chạy **12 pass**. Test mới ban đầu tái hiện cycle bị ẩn, vạch giả và phép cuộn quá tải chưa đạt ngưỡng. Vì vậy không chỉ dựa vào kết quả đếm 500 thanh để nghiệm thu.

## Kiểm chứng sau sửa

| Kiểm tra | Kết quả |
| --- | --- |
| Unit time scale/view model/geometry | 13 pass, 0 fail |
| Bộ T-31 production component | 5 pass, 0 fail |
| Trang fixture để dùng trên điện thoại, không mock API | 1 pass, 0 fail |
| Regression frontend đầy đủ | 29 pass, 12 skipped, 0 fail |
| Frontend lint | Pass, không có warning |
| Frontend build | Pass; cảnh báo chunk chung khoảng 1,3 MB của ứng dụng hiện tại |

12 test skipped thuộc các luồng DB/E2E/service-worker cần môi trường riêng, không phải test T-31. Build warning hiện là bundle chung của App/routes hiện tại; phiên này không thay cấu trúc route/global UI để xử lý cảnh báo đó.

Test T-31 chuyên biệt kiểm tra:

- Tọa độ tính tay với range 0–100, width 5.600 px: `x = ES × 56`, width = `(EF − ES) × 56`.
- Duyệt tất cả ID 1–500 theo từng vùng cuộn; kiểm tra từng vị trí/độ rộng, hàng đầu và cuối. Không chỉ kiểm tra số DOM nodes.
- Tên trùng vẫn chọn đúng ID; thanh bị cắt trái/phải, nằm ngoài range, dữ liệu null/sai thứ tự và milestone cuối range.
- Bounding box cột tên không đổi X khi cuộn ngang; header không đổi Y khi cuộn dọc.
- Nhóm 250 task/10 hạng mục, chọn hàng cuối, dependency highlight, thu gọn và lọc từ cuối danh sách về dữ liệu nhỏ.
- Luồng Schedule/drawer/progress, ngày/tuần/tháng, critical path và cycle alert giữ hoạt động qua regression.

## Số đo cuộn

Component thật được Vite build production, không có chi phí React dev debug stack hoặc Playwright trace. CPU giảm tốc 4 lần, viewport 390 × 844, DPR 3, Chromium 153.0.8010.12. Mỗi phép đo tự cuộn đi/về trong 2,4 giây, ghi từng khoảng requestAnimationFrame.

| Phép đo | Hành trình một chiều | FPS | Frame p95 |
| --- | --- | ---: | ---: |
| Cuộn ngang, giữ vùng hàng giữa | 5.397 px ngang | 60,00 | 16,70 ms |
| Cuộn dọc thông thường | 1.470 px dọc | 55,45 | 33,30 ms |
| Quá tải: cả hai trục qua toàn bộ danh sách | 21.600 px dọc + 5.397 px ngang | 16,03 | 100,00 ms |

Ngưỡng regression của cuộn ngang/dọc thông thường là ≥30 FPS và frame p95 ≤100 ms. Phép thử quá tải là quan sát thêm, không đánh đồng với cử chỉ cuộn thông thường. Nó kéo toàn bộ 500 hàng tới cuối trong 1,2 giây rồi trở về; kết quả cho thấy vẫn có thể giật khi chuyển rất nhanh đồng thời qua nhiều hàng. Không tuyên bố mọi tốc độ cuộn đã mượt hoặc mọi điện thoại đạt các số đo này.

Các bài đo ban đầu ở development có kết quả thấp (khoảng 7,8 FPS cho cuộn cả hai trục qua toàn bộ 500 hàng). Profile cho thấy React dev debug chiếm đáng kể thời gian; bài đo cuối chuyển sang production và tách từng hành trình như bảng trên. Không dùng hai điều kiện khác nhau để tuyên bố mức tăng hiệu năng.

- [JSON đầy đủ và các frame](t31/scroll-metrics.json).
- [Báo cáo browser T-31](t31/browser-results.json).
- [Ảnh 500 công việc trên mobile mô phỏng](t31/500-mobile.png).

## File sửa/tạo trong phiên T-31

- `frontend/src/features/gantt/Gantt.jsx`: cycle, geometry, cửa sổ hàng, cache trục, giới hạn grid/dependency.
- `frontend/src/features/gantt/barGeometry.js`: helper mới cho clipping/invalid range.
- `frontend/src/features/gantt/useGanttViewport.js`: hook mới cho cửa sổ hàng/resize/RAF.
- `frontend/src/features/gantt/gantt.css`: spacer, thông báo mốc thiếu và vùng dependency.
- `frontend/src/pages/Schedule.jsx`: mount bảng CPM khi mở.
- `frontend/tests/gantt.spec.js`: kiểm tra 500 task theo tổng logic và hàng cuối, phù hợp render viewport.
- `frontend/tests/schedule-view-model.test.mjs`: unit regression geometry.
- `frontend/tests/gantt-t31.spec.js`: kiểm tra chi tiết T-31 và số đo.
- `frontend/tests/fixtures/gantt.html`, `gantt.jsx`, `gantt-data.mjs`, `gantt-server.mjs`: trang thử độc lập dùng component sản phẩm; dữ liệu tổng hợp chỉ nằm trong test fixture.
- `frontend/playwright.t31.config.js`: build/serve fixture production, báo cáo JSON.
- `frontend/package.json`, `playwright.config.js`, `eslint.config.js`, `.gitignore`: lệnh test riêng, không trộn bài đo production vào suite dev, bỏ qua asset sinh tự động.

Không sửa backend/API/database, không thêm package, không chạy migration, không commit/push. Các thay đổi khác đang có trong working tree được giữ nguyên.

## Chạy lại và kiểm tra điện thoại thật

Trong `frontend`:

```powershell
npm.cmd run test:unit
npm.cmd run test:t31
npm.cmd test -- --reporter=line
npm.cmd run lint
npm.cmd run build
```

`test:t31` chạy riêng trên production fixture; suite dev vẫn kiểm tra tích hợp Schedule thực tế. Trên Windows, teardown Vite có thể chờ sau khi test kết thúc; các lượt trong phiên này đã dừng đúng PID server thử nghiệm để nhận summary, không dừng ứng dụng người dùng.

Để kiểm tra trên điện thoại tầm trung cùng Wi‑Fi:

```powershell
npm.cmd run test:t31:serve -- --lan
```

Terminal in URL `Phone: http://<IP-máy>:5178/tests/fixtures/gantt.html`. Mở trên điện thoại, cuộn ngang và dọc tới hàng cuối ở hướng dọc/ngang; kiểm tra tên/header cố định, vị trí thanh và chọn đúng công việc khi chạm. Nếu có bàn phím, kiểm tra tooltip khi focus. Trang chỉ phục vụ dữ liệu tổng hợp 500 task, không gọi backend hoặc thay dữ liệu thật. Khi xong dừng bằng Ctrl+C. Ghi model máy, trình duyệt và kết quả cử chỉ cuộn trước khi chốt tiêu chí thiết bị vật lý.

**Trạng thái:** các lỗi cụ thể và phần thiếu của code T-31 đã sửa, kiểm thử tự động đạt cho các điều kiện nêu trên. Tiêu chí điện thoại tầm trung vật lý còn cần chạy trên thiết bị; phép cuộn quá tải vẫn giảm FPS.

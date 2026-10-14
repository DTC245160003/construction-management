# Tích hợp Sprint 3 trên integration/sprint3-complete

Nguồn:

- `ed6121f`: T29–T35, Gantt Day/Week, thanh progress, tooltip và task drawer.
- `4caff96`: T36–T40, actuals, tính lại CPM, dự báo và lịch làm việc.
- `1349b71`, `7b247f4`, `5f47444`: sửa kiểm thử migration và cô lập database.
- `832f3e6`: T41–T45, baseline/history, milestone và cảnh báo kèm chuỗi công việc.

## Migration chuẩn

1. `015_add_task_actuals.sql` / `.down.sql`: `tasks.actual_start`, `actual_finish`, `progress_percent`; `schedule_results.initially_critical`, `planned_early_finish`.
2. `016_create_baselines_and_milestones.sql` / `.down.sql`: giữ nguyên bảng baseline/history/milestone/alert của main.

Không dùng migration actual progress riêng của T29–T35. API `/tasks/:id/progress` nhận payload UI rồi ghi vào schema canonical của 015. Các API task, schedule, baseline và milestone hiện có được giữ.

Runner nhận diện history `015_create_baselines_and_milestones.sql` đã áp dụng bằng checksum chính xác, đổi tên history sang 016 trong cùng transaction, rồi áp dụng actuals 015. Không chạy lại DDL baseline và không đổi dữ liệu baseline. `status` chỉ đọc; checksum không khớp bị từ chối. Migration 001–014 được giữ nguyên. Không tự chạy migration trên database ứng dụng trong quá trình xử lý conflict.

## Hành vi tích hợp

Schedule tiếp tục hiển thị bảng CPM, bộ lọc găng phía server, chốt baseline và cảnh báo mốc. Gantt dùng lịch ngày làm việc/ngày lễ đã lưu trong dự án; ES/EF vẫn là ngày làm việc từ backend. Các lớp kế hoạch gốc, ngày thực tế, phần trăm hoàn thành và milestone dùng cùng trục thời gian.

Ngày thực tế được đổi sang offset làm việc trước khi tính CPM; cập nhật progress làm bẩn cache hiện có. Công việc đang làm được dự báo lại theo ngày hiện tại. Đếm ngày trễ milestone vẫn dùng khoảng `(hạn cam kết, ngày kết thúc]`; helper đếm bao gồm hai đầu của T39 được giữ riêng để không đổi quy tắc T44.

## Kiểm chứng

- `backend: npm run test:postgres -- --testTimeout=30000`
- `frontend: npm run lint`, `npm run build`, `npm run test:unit`
- Playwright: Schedule/Gantt/UX và renderer 500 hàng.
- `backend/tests/sprint3.integration.postgres.test.js`: phiên đăng nhập thật, API thật, PostgreSQL schema riêng; actuals → CPM → baseline → milestone/alerts, authorization và nâng cấp migration history có dữ liệu.
- `frontend/tests/project-calendar.test.mjs`: lịch 6 ngày, ngày lễ, baseline/actual layer và không đổi ES/EF.

Benchmark thử nghiệm độc lập và trace/test-failed artifact không thuộc runtime đã được loại khỏi thay đổi tích hợp.

# Báo cáo triển khai Sprint 6–8 — XÂY DỰNG SỐ

Ngày báo cáo: 15/10/2026. Nhánh `feature/sprint6-8-integration`, từ `origin/main`
`9bd97cc` đã tích hợp Sprint 4–5 và S-24. Không commit, push hoặc merge main.
Thay đổi nằm tại worktree có sẵn `.worktrees/sprint4-5`; không tạo ứng dụng thứ hai.

## Phạm vi và nguồn nghiệm thu

Đã đọc toàn bộ bảy sheet của `Nền tảng điều hành thi công công trình.xlsx` và
prompt đính kèm. [Bản đối chiếu](sprint6-8-requirements.md) có nguyên văn đủ 17
Story, tọa độ ô, các ràng buộc liên quan và khác biệt từng Story. Workbook được
ưu tiên; không sửa workbook hoặc coi nội dung ngoài phạm vi là lệnh thực thi.

Các khác biệt có tác động trực tiếp đã áp dụng:

- S-35: cha cộng **giá trị** các lá và không được nhập hợp đồng trực tiếp.
- S-37: chặn ngay lúc **lập phiếu**, bằng khóa/ràng buộc PostgreSQL; không chỉ
  chặn tổng đã duyệt ở giao diện.
- S-41/S-42: người duyệt nhìn thấy khoảng cách và cảnh báo ảnh; tuổi ảnh so với
  **ngày nghiệm thu**, có mức tin cậy và lý do.
- S-44: trả lại thanh toán phải **giải phóng** nghiệm thu, nhưng vẫn giữ lịch sử dòng.
- S-45: tỷ lệ tạm giữ là cấu hình **dự án**, server quyết định khi lập đề nghị.
- S-49: tiến độ theo **giá trị hợp đồng**, chênh lệch với **baseline gốc**, theo
  ngày làm việc; dùng cả cảnh báo mốc hạng mục S-19.
- S-51/DoD: kiểm thử local không chứng minh cả nhóm đã nhận cảnh báo staging.

`DONE` dưới đây nghĩa là đã triển khai và có kiểm thử kỹ thuật local cho tiêu chí
Story. Không có nghĩa đã đạt toàn bộ DoD phát hành: staging, peer review, Samsung
thật, remote CI và quyết định nghiệp vụ còn được ghi riêng bên dưới.

## Kết quả từng Story

| Story | Trạng thái | Chức năng thực tế và bằng chứng |
| --- | --- | --- |
| S-35 | DONE | NUMERIC khối lượng/đơn giá lá, cộng giá trị cha; đồng bộ hai chiều hợp đồng WBS và sổ tài chính bằng trigger trong cùng transaction. Chặn nhập cha/cắt hợp đồng đã có dữ liệu; kiểm thử PostgreSQL và E2E. |
| S-36 | DONE | Draft theo kỳ, lũy kế trừ lũy kế **đã duyệt**, hiện sản lượng S-26 bên cạnh, chọn ảnh, chi tiết người lập/duyệt. Draft không tính vào khối lượng ghi nhận. |
| S-37 | DONE | Khóa dòng dự án/hợp đồng, kiểm tra giới hạn DB và unique một kỳ đang xử lý/lá; hai request cạnh tranh cho kết quả 201/409. Truy vấn SQL vượt giới hạn cũng bị chặn. Lỗi API có số lũy kế/hợp đồng cụ thể. |
| S-38 | DONE | Draft → Submitted → Approved/Returned; bắt buộc lý do trả lại, người lập sửa lại; phiếu đã duyệt bất biến. Phiếu điều chỉnh riêng tăng/giảm thay thế phiếu chưa thanh toán sau khi duyệt, lưu bản gốc và delta âm/dương; xem giới hạn nghiệp vụ bên dưới. |
| S-39 | DONE | Audit actor/thời điểm/đối tượng/before/after cho hợp đồng, nghiệm thu, điều chỉnh, thanh toán, tỷ lệ tạm giữ và khóa/mở sổ. Tái sử dụng audit append-only, không có API sửa/xóa. Test khóa sổ và actor audit. |
| S-40 | DONE | Đọc EXIF từ byte gốc, lưu SHA-256/thời điểm/GPS; bảo toàn bản gốc, thumbnail riêng; báo rõ thiếu metadata. Giờ EXIF thiếu offset không bị tự chuyển thành giờ Việt Nam. Phân quyền file và metadata theo dự án/tác giả. |
| S-41 | DONE | Cấu hình tâm/radius dự án, Haversine, hiện khoảng cách và dấu ngoài bán kính trong trang ảnh, phiếu nghiệm thu và PDF; không tự xóa/bác bỏ ảnh. |
| S-42 | DONE | Thiếu EXIF máy ảnh, 14 cặp kích thước màn hình, tên/phần mềm screenshot, tuổi ảnh và đồng hồ tương lai; hiển thị lý do và độ tin cậy none/low/medium. Có test ảnh EXIF thật và ảnh không EXIF. |
| S-43 | DONE | Chọn nghiệm thu hiệu lực đã duyệt, snapshot số lượng/đơn giá/thành tiền; BigInt/NUMERIC và làm tròn từng dòng. Unique một thanh toán hiệu lực/phiếu ở DB; test song song, duplicate và đối chiếu tổng dòng. |
| S-44 | DONE | Trình/duyệt/trả lại có lý do; DB khóa đề nghị và dòng đã duyệt. Trả lại đánh dấu released, giữ dòng lịch sử và cho dùng nghiệm thu ở đề nghị mới; E2E kiểm tra đầy đủ vòng trả lại/tái sử dụng. |
| S-45 | DONE | Tỷ lệ dự án có revision/audit, form chỉ đọc tỷ lệ; server không tin tỷ lệ client khi có cấu hình. Gross/retained/net và tổng giữ lại **đã duyệt**; test làm tròn và không cộng trùng phiếu trả lại. |
| S-46 | DONE | Dự toán lá/cộng lên cây, thay đổi tạo phiên bản mới, xem lịch sử ngay trên UI; đã thử đổi sau khi có thực chi. |
| S-47 | DONE | Chi phí ngày/loại/tiền/lá, CSV mẫu và import atomic/idempotent; mã trống/không tìm thấy/không phải lá vào chờ phân bổ, giữ tham chiếu gốc trong ghi chú; UI phân bổ sau. |
| S-48 | DONE | So sánh và cảnh báo lá/cha, đúng điều kiện **chi >80%** và **nghiệm thu <80%**; test số tính tay, biên đúng 80%, cộng nhiều lá. |
| S-49 | DONE | Dashboard từ CPM, hợp đồng/nghiệm thu thật, baseline đầu tiên và lịch làm việc gốc, mốc S-19, việc găng chưa xong bị trễ. Thiếu hợp đồng hoặc lịch gốc cũ thì hiển thị chưa xác định, không bịa tiến độ/ngày dự báo. |
| S-50 | DONE | PDF tiếng Việt nhúng font/ảnh thật; đủ các đợt, lũy kế, tác giả/người duyệt, GPS/time/lý do cảnh báo; hỗ trợ chọn cha và phân trang ghi chú dài. Mẫu **nội bộ**, có nhãn cần xác nhận mẫu hoàn công. Kiểm tra nội dung và render ba trang để xem trực tiếp. |
| S-51 | PARTIAL | `/health` app + DB, timeout/cache/redaction, Docker healthcheck, monitor webhook qua env, ngưỡng **quá** 300 giây, retry/dedup/recovery đã kiểm thử local. **BLOCKED:** chưa có staging/host monitor/kênh cả nhóm; chưa gửi hay xác minh cảnh báo thật. |

## Migration và bảo vệ dữ liệu

Migration mới: `backend/src/migrations/021_sprint6_8_financial_integrity.sql` và
`.down.sql`. Bổ sung `project_payment_terms`, `original_baseline_context`,
liên kết adjustment, `effective_acceptances`, partial unique payment chưa
released, trigger bảo vệ hồ sơ và bridge hợp đồng. Down migration dừng khi có
dữ liệu mới cần bảo toàn; không âm thầm xóa điều chỉnh/lịch sử/tạm giữ.

Main có hai migration số 009. Cặp `009_create_task_dependencies` được chuyển
**nguyên byte** vào `migrations/archive`, không thực thi cùng 009 canonical.
Runner dừng trước mọi ghi schema/history nếu DB từng ghi cặp archive. Có test
cho guard này và các guard checksum/lịch sử cũ. Không đổi SQL/checksum 017,
018, 019 hay 020; không tự baseline lịch sử để vượt guard.

Chỉ tạo/nâng cấp `construction_sprint68_test`; integration/E2E dùng schema UUID
riêng, dọn schema của chính bộ kiểm thử. Database không bị xóa. Public schema
test dành cho demo QA. **Không chạy migration hoặc sửa dữ liệu trên database
ứng dụng/production/demo cũ.** Bốn file `backup-regression-*` không theo dõi
được giữ nguyên. Các thay đổi có sẵn tại repository gốc được giữ.

## API và UI

Các route hiện có được mở rộng trong cùng kiến trúc auth, session và RBAC.
Tiền tố bên dưới là `/projects/:projectId`; alias `/api/v1/projects` giữ hoạt động.

| API | Mục đích |
| --- | --- |
| `GET /acceptance`, `PUT /contracts/:id` | Hợp đồng lá, rollup cha, phiếu và review ảnh |
| `POST /acceptance`, `PUT /acceptance/:id` | Lập/sửa draft hoặc returned, kiểm tra revision |
| `POST /acceptance/:id/transition` | submit/approve/return |
| `POST /acceptance/:id/adjustments` | Phiếu thay thế có lý do, tham chiếu bản gốc |
| `GET /photos`, `POST /photos`, `GET /photos/:id/:variant` | Metadata/ảnh gốc/thumbnail, kiểm tra quyền dự án |
| `GET/PUT /settings` | Tọa độ/radius, revision và audit |
| `PUT /payment-terms` | Tỷ lệ dự án |
| `GET/POST /payments`, `PUT /payments/:id`, `POST /payments/:id/transition` | Đề nghị và quy trình duyệt/trả lại |
| `GET /costs`, `POST /budgets`, `POST /costs`, `POST /costs/import`, `PATCH /costs/:id/allocate` | Dự toán/version, CSV/chi phí, phân bổ |
| `GET /reports`, `GET /reports/acceptance.pdf` | Dashboard và PDF có bảo vệ quyền |
| `GET /health` (không có tiền tố) | Sức khỏe app và PostgreSQL, 200/503 |

UI: `/acceptance`, `/payments`, `/costs-materials`, `/reports`, `/site-photos`,
đều dùng `?projectId=...`; giữ DashboardLayout, nhận diện và navigation hiện có.
Sửa accessible label của RecordEditor, render AttachmentPicker/preview đúng,
hiển thị loading/empty/lỗi API. Worker không xem đơn giá/hồ sơ tài chính;
người ngoài dự án bị từ chối cả metadata lẫn file/PDF. Mobile automated ở
390×844; không coi đó là kiểm thử Samsung thật.

## Quy tắc và các refinement còn mở

- Một lá chỉ có một draft/submitted cho kỳ tiếp theo, tránh hai draft cùng trừ
  một mốc đã duyệt. Returned không giữ chỗ. Chỉ approved hiệu lực được cộng.
- Điều chỉnh là **phiếu thay thế**, không sửa bản gốc: lượng đợt mới phải dương,
  delta so bản cũ có thể âm/dương. Duyệt xong loại bản cũ khỏi tổng hiệu lực;
  những snapshot lịch sử đợt sau không bị viết lại. Chỉ áp dụng bản hiệu lực
  chưa gắn thanh toán còn hiệu lực. Hủy toàn bộ về 0 hoặc credit sau thanh toán
  cần quy tắc riêng; chưa triển khai/không tự suy đoán N45.
- Khối lượng 4 chữ số thập phân, đơn giá/tiền 2 chữ số. Từng dòng
  `quantity × unit_price` làm tròn half-up về 2 số, tổng là tổng các dòng;
  tạm giữ làm tròn half-up trên gross, net = gross − retained. Phần trăm biểu
  đồ dùng Number để hiển thị; điều kiện tài chính dùng BigInt/NUMERIC.
- Tạm giữ 0–100%, snapshot khi tạo/sửa draft. Đổi tỷ lệ dự án không thay hồ sơ
  đã duyệt. Chưa áp dụng trần tạm giữ vì tài liệu chưa chốt.
- Ảnh đính kèm chưa bắt buộc (N43 chưa chốt). Project members có quyền đọc
  module xem GPS; worker chỉ ảnh của mình. Metadata có `private, no-store`;
  cần chủ dữ liệu xác nhận chính sách raw GPS và thời hạn lưu audit trước phát hành.
- Ngưỡng ảnh mặc định 7 ngày so ngày nghiệm thu, tương lai 24 giờ;
  `PHOTO_MAX_CAPTURE_AGE_DAYS`, `PHOTO_FUTURE_TOLERANCE_HOURS` cấu hình được.
  Kích thước màn hình là danh sách 14 cặp phổ biến, có thể false positive.
  Nhiều nhóm dấu hiệu → medium, một nhóm → low, không dấu hiệu → none;
  không dùng mức này như xác suất ảnh giả. Sai số GPS nếu có được giải thích
  khi gần ranh giới; không tự nới radius hay tạo GPS.
- Duyệt một cấp theo quyền dự án hiện có. Ngân sách là một số tổng/lá;
  category chi phí do người dùng ghi. Chưa có invoice integration vì N53 chưa chốt.
- Baseline cũ không lưu start/calendar thì báo thiếu ngữ cảnh; không backfill
  bằng ngày hiện tại. Baseline mới lưu snapshot start/calendar/holidays ở 021.
- PDF nội bộ có thông báo cần duyệt mẫu chính thức/chữ ký trước dùng hoàn công.
  `PDF_FONT_PATH` cho phép font riêng; Dockerfile cài `fonts-dejavu-core` và
  chọn DejaVu Sans hỗ trợ tiếng Việt. Windows dùng Arial khi không chỉ định.
  Thay đổi Dockerfile chưa được image-build vì Engine không hoạt động.

## Kiểm thử thực tế

Tổng hợp máy đọc được: [validation-summary.json](sprint6-8/validation-summary.json).
Danh sách thay đổi: [changed-files.txt](sprint6-8/changed-files.txt).
Hash migration/backup và trạng thái repository gốc:
[migration-integrity.json](sprint6-8/migration-integrity.json).

Lệnh PostgreSQL qua `backend/scripts/test-sprint68.cjs` chỉ dùng DB test nêu
trên. Trên Windows, runner giữ TEMP/TMP trong `.tmp/sprint68-runtime` trên ổ D
để tránh ổ C gần đầy; không thay TEMP hệ thống. Không bỏ hoặc làm yếu assertion.

| Bộ kiểm tra | PASS | FAIL | SKIP | Bằng chứng |
| --- | ---: | ---: | ---: | --- |
| Backend unit + PostgreSQL, 30 suites | 338 | 0 | 0 | `sprint6-8/backend-test-results.json` |
| Nhóm mới financial/photo/PDF (nằm trong 338) | 27 | 0 | 0 | `sprint6-8/new-stories-results.json` |
| Frontend unit | 22 | 0 | 0 | `sprint6-8/validation-summary.json` |
| Sprint 6–8 real PostgreSQL/Chrome E2E | 2 | 0 | 0 | `sprint6-8/playwright-results.json` |
| Sprint 4–5 offline/PWA | 10 | 0 | 0 | `sprint4-5/playwright-results.json`, `sprint6-8/offline-evidence.json` |
| Real schedule/calendar regression | 12 | 0 | 0 | `sprint4-5/real-regression-results.json` |
| Super Admin | 3 | 0 | 0 | `super-admin/playwright-results.json` |
| UI regression | 32 | 0 | 1 | `sprint4-5/ui-regression-results.json` |
| Worker opt-in riêng | 1 | 0 | 0 | `sprint4-5/worker-development-results.json`; bù case opt-in ở UI |
| Lint backend/frontend, frontend production build | PASS | 0 | — | Bundle khởi động 493,03 KB; không có lỗi build |
| PDF render và xem trực tiếp | 3 trang | 0 | — | `sprint6-8/evidence/acceptance-dossier.pdf` và PNG từng trang |
| Docker image / staging / thông báo cả nhóm | — | — | — | BLOCKED: Docker Engine không chạy, chưa có staging/webhook thật |

Coverage backend: statements **88,53%**, branches **76,48%**, functions **93,39%**,
lines **92,04%**. Chi tiết `sprint6-8/coverage-summary.json`. Đây là số đo hiện tại;
chưa có baseline coverage so sánh hợp lệ trên main có migration trùng 009, nên
không khẳng định đã chứng minh điều kiện DoD coverage không giảm.

Các lần chẩn đoán offline giữ nguyên 20/30 và restart/replay đã phát hiện thời
gian đồng bộ/mở shell vượt assertion. Không tăng timeout hoặc hạ chuẩn 1 giây;
đã chuyển profile test khỏi ổ C gần đầy, giảm lượt đọc IndexedDB/giải mã ảnh
trùng lặp và tải riêng module cây/tiến độ/phân công. Bundle khởi động giảm từ
1.328,15 KB xuống 493,03 KB. Lượt cuối đủ 10/10 PASS, không flaky/skip:
shell 519,4 ms (<1000 ms), toàn kịch bản 20 nhật ký/30 ảnh 93.092 ms (<180.000 ms),
giữ bản gốc lớn hơn 1 MB, thumbnail dưới 1 MB, restart và replay không trùng.
MutationObserver chẩn đoán thấy 20 bản ghi ở 252,2 ms; assertion vẫn dùng
`performance.now()` như cũ. Bằng chứng trong `sprint6-8/offline-evidence.json`.
Assertion Vite kiểm tra Ant Design tải thành công được chuyển sang trang cây
hạng mục sử dụng thư viện này, kèm kiểm tra đăng nhập không tải Ant Design.
Thay đổi này phản ánh route tải khi cần sau tối ưu bundle; vẫn kiểm tra đầy đủ
lỗi tải module, service worker và các trang public.

Quét dependency thực qua registry ngày 15/10/2026: frontend **0**, backend
production **0**, backend toàn bộ **19 moderate / 0 high / 0 critical** trong
chuỗi Jest/sprintf-js. Không đổi Jest xuống phiên bản major cũ để che cảnh báo.
Đã pin override `source-map-js@1.2.2`, bản vá cho lỗ hổng frontend.
[Advisory source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
Advisory sprintf-js hiện chưa có bản vá; cần theo dõi hoặc thay bộ công cụ dev.
[Advisory sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
Raw audit JSON nằm trong `sprint6-8/*-npm-audit.json`; không coi quét toàn bộ là sạch.

CI đã bổ sung E2E Sprint 6–8, coverage backend, production audit chặn moderate,
full backend audit chặn high/critical và frontend audit. Chưa push nên **remote
CI chưa chạy**. Dự án JavaScript chưa cấu hình typecheck riêng; lint không thay
thế bằng chứng typecheck theo DoD. Peer review, staging AC và Samsung thật chưa thực hiện.

## Demo và kiểm tra lại

Demo QA hiện tại: `http://127.0.0.1:4176`, backend `127.0.0.1:3068`, database
`construction_sprint68_test`, dự án **1**. Đã tạo tài khoản QA qua API và cấp
Super Admin qua CLI helper với kiểm tra đúng DB test; không nâng tài khoản
người dùng thật. Tài khoản/mật khẩu ngẫu nhiên chỉ ở file local bị Git ignore:
`.tmp/sprint68-demo-credentials.json`. Không ghi password trong báo cáo.

Khởi động lại trong hai terminal ở worktree:

```powershell
cd backend
npm run demo:sprint68
```

```powershell
cd frontend
npm run build
$env:API_PROXY_TARGET='http://127.0.0.1:3068'
npm run preview -- --host 127.0.0.1 --port 4176 --strictPort
```

Demo không tự tạo tài khoản khi khởi động. Có thể dùng QA đã tạo hoặc đăng ký
ở `/register`, cấp quyền thủ công theo README. Không gửi email từ demo test.
Dependencies đã cài trong phiên này. Với checkout mới, chạy `npm ci` trong
từng thư mục backend/frontend trước các lệnh khởi động.

Các bước xem demo:

1. Mở `/acceptance?projectId=1`: cha 505,00; lá 100×1,01 và 200×2,02;
   phiếu đã duyệt 20 m³; ảnh TEST EXIF cố ý ngoài bán kính và cảnh báo khoảng cách.
2. Mở `/payments?projectId=1`: tỷ lệ dự án 10%; gross 20,20, giữ 2,02,
   net 18,18. Phiếu đã duyệt khóa sửa. Muốn demo vòng trả lại tạo kỳ nghiệm thu mới.
3. Mở `/costs-materials?projectId=1`: dự toán 300,00, thực chi gắn lá 249,00,
   tỷ lệ 83%, nghiệm thu theo giá trị 4%, cảnh báo cha và lá; khoản 5,00 chờ phân bổ.
4. Mở `/reports?projectId=1`: tiến độ 4%, baseline gốc 08/10, CPM hiện tại
   10/10, chênh +2 ngày làm việc; mốc bàn giao và việc găng. Xuất PDF theo cha/lá.
5. Ảnh/tài khoản/số tiền là dữ liệu QA tổng hợp, không phải hồ sơ công trình thực.
   Đối chiếu số API ở `sprint6-8/demo-evidence.json`.

Chạy lại tự động (backend .env chỉ dùng thông tin kết nối, không đổi DB ứng dụng):

```powershell
cd backend
npm run lint
npm run test:sprint68 -- --ci --coverage
node scripts/test-sprint68.cjs --frontend test:sprint68
node scripts/test-sprint68.cjs --frontend test:sprint45
node scripts/test-sprint68.cjs --frontend test:real-regression
node scripts/test-sprint68.cjs --frontend test:system-admin
node scripts/test-sprint68.cjs --frontend test:ui-regression
node scripts/test-sprint68.cjs --frontend test:worker-dev
cd ../frontend
npm run lint
npm run test:unit
npm run build
```

Trên Windows dùng Chrome; Linux cài Chromium bằng Playwright trước. Hướng dẫn
monitor trong [S51-HEALTH-MONITORING](sprint6-8/S51-HEALTH-MONITORING.md).

## Trước phát hành chính thức

1. Review code và thống nhất refinement âm/hủy/credit, raw GPS/lưu audit,
   trần tạm giữ/cấp duyệt và mẫu PDF với chủ nghiệp vụ.
2. Nâng cấp thử bản sao DB sau backup, xác nhận migration history/checksum và
   baseline cũ thiếu ngữ cảnh; không tự chạy lên DB ứng dụng từ phiên làm việc này.
3. Chạy CI trên PR, giải quyết moderate dev dependency hoặc phê duyệt ngoại lệ
   có theo dõi; bổ sung chiến lược typecheck/so sánh coverage theo DoD.
4. Kiểm thử nghiệm thu trên staging và Samsung Android thật, gồm offline/restart,
   camera/EXIF/quyền vị trí và PDF mẫu thực tế.
5. Chạy Docker build khi Engine hoạt động; triển khai monitor độc lập và xác
   minh cả nhóm nhận outage >5 phút và recovery. Chưa có bằng chứng này thì
   S-51 và DoD phát hành chưa hoàn tất.

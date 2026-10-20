# Đối chiếu yêu cầu gốc S-01–S-51 — 20/10/2026

Phạm vi: tiếp tục từ bằng chứng đã có, đọc source và báo cáo; không chạy lại các bộ test đã PASS hoặc sửa mã production. Bổ sung phép đo mới S-11 và S-16 trong bộ nhớ, không database/HTTP/UI. Audit không gửi queue, migrate/seed/reset, commit/push/merge hoặc phát hành. Có [tổng hợp JSON](2026-10-20-story-audit.json).

## Nguồn và cách đọc trạng thái

Workbook gốc `C:/Users/Lenovo/Downloads/Nền tảng điều hành thi công công trình.xlsx` được kiểm SHA-256 lại trong lượt này, vẫn là `86aab2270a132a15231fddf4d933c22645d3eb05b2149369bd94d365d1542a4b`. Không sửa workbook. Đã đối chiếu văn bản 51 Story với [bảy sheet trích nguyên gốc](audit-original-workbook.json) và [51 Story kèm tọa độ ô](audit-original-stories.json); phần Story/AC/NFR khớp nhau. [Backlog trích trước](backlog-source.json) và [nguyên văn S-35–S-51](../sprint6-8-requirements.md) được giữ làm nguồn truy vết. S-52–S-58 và K-01 không tự động được thêm vào phạm vi tính 51 Story; yêu cầu đáp án tính tay trong S-10/DoD vẫn áp dụng.

Báo cáo hợp nhất ghi nhận **41 PASS kỹ thuật local / 10 PARTIAL** (đổi nhãn DONE thành PASS trong bảng dưới, không xóa công việc đã hoàn thành). Cột **đối chiếu gốc** còn tính các AC/NFR chưa có bằng chứng đúng điều kiện và các refinement ghi rõ “cần chốt” trong nguồn. Vì vậy PARTIAL ở cột này có thể là thiếu quyết định sản phẩm hoặc thiếu bằng chứng, không phải kết luận code đã lỗi. Không tự thêm AC, thay công thức hoặc yêu cầu người dùng làm lại UAT đã xác nhận.

Kết quả đối chiếu sau phép đo S-11 mới: **24 PASS / 27 PARTIAL** theo phạm vi trên (trước phép đo: 23/28). **DoD/phát hành toàn bộ vẫn PARTIAL** vì các cổng chung chưa hoàn tất; không có Story nào được tuyên bố phát hành chỉ dựa trên PASS local.

Lỗi Samsung PWA **Failed to fetch** được xử lý ở [checkpoint kết nối](connectivity/README.md): đã khôi phục host 3082/4174, còn chờ Samsung kết nối ADB để xác minh HTTP/UI. Bằng chứng health/standalone ngày 15/10 là lịch sử; không dùng thay cho trạng thái thiết bị ngày 20/10. Giữ `HELD_FOR_OFFLINE_REVIEW`, không bật sync để lấy bằng chứng.

## Bảng 51 Story

Mọi tọa độ dưới đây thuộc sheet `Backlog` của nguồn gốc; cột bằng chứng trỏ vào artifact đã lưu, không có nghĩa vừa chạy lại. Các cổng DoD chung ở phần sau áp dụng cho toàn bảng.

| Story | Sprint | Ô nguồn | Kỹ thuật đã ghi | Đối chiếu gốc | Bằng chứng | Phần còn thiếu / quyết định |
| --- | ---: | --- | --- | --- | --- | --- |
| S-01 | 1 | `A2:O2` | PARTIAL | PARTIAL | [DOCKER], [CI] | Thiếu run CI từ remote, auto-deploy staging và thử thất bại vẫn phục vụ bản trước; cấu hình Render hiện auto-deploy off có chủ đích. |
| S-02 | 1 | `A5:O5` | PASS | PASS | [B], [LOGOUT] | Có thêm khóa logout bền, chống phản hồi cũ/cleanup lỗi, phục hồi sau 403 và 26 unit / 16 browser PASS ngày 20/10; điện thoại chưa xác minh bản logout mới. |
| S-03 | 1 | `A6:O6` | PASS | PASS | [B], [UI] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-04 | 1 | `A8:O8` | PARTIAL | PARTIAL | [B], [UI] | AC cho Ban quản lý tạo dự án khác chính sách Super Admin đã được chọn; thiếu đo UI 500 hạng mục <2 giây. Không tự mở rộng quyền. |
| S-05 | 2 | `A13:O13` | PASS | PASS | [B], [CPM] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-06 | 2 | `A14:O14` | PASS | PASS | [B], [CPM] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-07 | 2 | `A15:O15` | PASS | PASS | [B], [CPM] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-08 | 2 | `A16:O16` | PASS | PASS | [B], [CPM] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-09 | 2 | `A17:O17` | PASS | PASS | [B], [CPM] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-10 | 2 | `A18:O18` | PARTIAL | PARTIAL | [B], [CPM] | Thiếu nguồn đáp án tính tay có người thứ hai kiểm độc lập; mutant PASS không thay thế người kiểm. |
| S-11 | 2 | `A19:O19` | PASS | PASS | [B], [CPM], [LOCAL-AC] | Mới đo 500 việc/2.000 quan hệ: candidate tạo vòng tối đa 1,639 ms, hợp lệ 1,333 ms, dưới 500 ms; không ghi trước khi chặn và đủ 500 tên. Chỉ là phép đo bộ nhớ trên host local; DoD staging vẫn riêng. |
| S-12 | 2 | `A20:O20` | PARTIAL | PARTIAL | [B], [CPM] | Thiếu đo bảng/API đã cache cho 500 việc <1 giây trên môi trường nghiệm thu. |
| S-13 | 3 | `A21:O21` | PARTIAL | PARTIAL | [B], [GANTT] | Thiếu bằng chứng 500 thanh <3 giây, cuộn mượt và tên đọc được trên thiết bị/môi trường nghiệm thu thật. |
| S-14 | 3 | `A22:O22` | PASS | PASS | [B], [GANTT] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-15 | 3 | `A23:O23` | PASS | PASS | [B], [GANTT] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-16 | 3 | `A24:O24` | PASS | PARTIAL | [B], [GANTT], [LOCAL-AC] | Tính lại 500 việc/2.000 quan hệ, trễ găng 3 ngày: tối đa 2,449 ms trong bộ nhớ. Chưa quan sát trình duyệt vẫn nhận thao tác trong lúc tính và kết quả hiện <5 giây. |
| S-17 | 3 | `A25:O25` | PASS | PASS | [B], [GANTT] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-18 | 3 | `A26:O26` | PASS | PASS | [B], [GANTT] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-19 | 3 | `A27:O27` | PASS | PASS | [B], [GANTT] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-20 | 3 | `A3:O3` | PARTIAL | PARTIAL | [BACKUP], [BACKUP-R] | Restore/count/hash bản sao PASS; chưa chứng minh lịch đêm staging, lỗi backup có log, giữ đúng 7 bản và lưu ngoài đĩa DB trong vận hành thật. |
| S-21 | 4 | `A32:O32` | PASS | PARTIAL | [B], [PWA], [PWA-R] | Thiếu nghiệm thu riêng NFR dùng một tay dưới ánh nắng trên điện thoại thật; UAT sử dụng chung không mô tả điều kiện này. |
| S-22 | 4 | `A33:O33` | PASS | PASS | [B], [PWA], [PWA-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-23 | 4 | `A34:O34` | PASS | PARTIAL | [PWA], [PWA-R], [PHOTO] | Cần xác nhận đơn vị <1 MB: code nhận <1.048.576 byte, báo cáo dùng MiB. Fixture 945.508 byte đạt cả hai; chưa có bằng chứng ranh giới 1.000.000 byte. Không suy ra ca người dùng đã lỗi. |
| S-24 | 4 | `A35:O35` | PASS | PASS | [B], [PWA], [PWA-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-25 | 4 | `A29:O29` | PASS | PASS | [B], [PWA], [PWA-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-26 | 4 | `A30:O30` | PASS | PARTIAL | [B], [PWA], [PWA-R] | Thiếu nghiệm thu riêng NFR một tay/nút dùng với găng trên điện thoại thật; viewport và nút >=44 px là bằng chứng kỹ thuật. |
| S-27 | 4 | `A36:O36` | PARTIAL | PARTIAL | [SAMSUNG], [SAMSUNG-R], [PWA-R] | Standalone/cập nhật trên Samsung từng PASS; chưa có số đo lần mở thứ hai <1 giây trên máy thật. Lỗi Failed to fetch hiện tại đang được xử lý riêng; camera thuộc S-23/S-29. |
| S-28 | 4 | `A7:O7` | PASS | PASS | [B], [PWA], [PWA-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-29 | 5 | `A37:O37` | PASS | PARTIAL | [B], [PWA], [PWA-R] | 20 mục/30 ảnh qua reload và restart desktop PASS; chưa có bằng chứng riêng journal có ảnh tồn tại sau đóng/mở hoặc hết pin trên Samsung thật. |
| S-30 | 5 | `A38:O38` | PARTIAL | PARTIAL | [B], [PWA], [PWA-R] | Chưa chứng minh OS/trình duyệt tự đồng bộ khi ứng dụng đã đóng. Foreground hoặc mở lại app không thay AC này; giữ gate held, không tự gửi queue. |
| S-31 | 5 | `A39:O39` | PASS | PASS | [B], [PWA], [PWA-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-32 | 5 | `A40:O40` | PASS | PASS | [B], [PWA], [PWA-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-33 | 5 | `A41:O41` | PASS | PASS | [B], [PWA], [PWA-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-34 | 5 | `A42:O42` | PARTIAL | PARTIAL | [B], [PWA], [PWA-R] | Kịch bản 20/30, replay và 88,217 giây local đã có; chưa có run CI từ remote theo AC. |
| S-35 | 6 | `A9:O9` | PASS | PASS | [B], [FIN], [FIN-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-36 | 6 | `A43:O43` | PASS | PARTIAL | [B], [FIN], [FIN-R] | AC đính ảnh/đối chiếu sản lượng PASS; NFR còn cần chốt ảnh bắt buộc hay tùy chọn. Không tự thêm ràng buộc bắt buộc. |
| S-37 | 6 | `A44:O44` | PASS | PASS | [B], [FIN], [FIN-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-38 | 6 | `A45:O45` | PASS | PARTIAL | [B], [FIN], [FIN-R] | Phiếu thay thế tăng/giảm cho bản chưa thanh toán có test; còn quyết định cách âm/hủy về 0/credit sau thanh toán. Không tự suy rộng mô hình hiện có. |
| S-39 | 6 | `A57:O57` | PASS | PARTIAL | [B], [FIN], [FIN-R] | Audit append-only và before/after PASS; NFR còn cần chốt thời hạn lưu, chưa coi một số năm tự chọn là yêu cầu được duyệt. |
| S-40 | 7 | `A46:O46` | PASS | PARTIAL | [B], [FIN], [FIN-R] | EXIF/gốc/metadata và quyền file có test; NFR còn cần chốt vai trò xem GPS thô. |
| S-41 | 7 | `A47:O47` | PASS | PARTIAL | [B], [FIN], [FIN-R] | Khoảng cách/radius và dấu nghi vấn có test; NFR còn cần chốt bán kính chấp nhận/sai số định vị. |
| S-42 | 7 | `A48:O48` | PASS | PASS | [B], [FIN], [FIN-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-43 | 7 | `A49:O49` | PASS | PASS | [B], [FIN], [FIN-R] | AC/NFR kỹ thuật đã có bằng chứng; còn cổng DoD chung. |
| S-44 | 7 | `A50:O50` | PASS | PARTIAL | [B], [FIN], [FIN-R] | Duyệt/trả/khóa và giải phóng phiếu có test; NFR còn cần chốt số cấp duyệt. |
| S-45 | 7 | `A51:O51` | PASS | PARTIAL | [B], [FIN], [FIN-R] | Tỷ lệ dự án, gross/retained/net và lũy kế có test; NFR còn cần chốt có trần tạm giữ hay không. |
| S-46 | 8 | `A52:O52` | PASS | PARTIAL | [B], [FIN], [FIN-R] | Nhập/cộng cây/version dự toán có test; NFR còn cần chốt một tổng hay tách vật tư/nhân công/máy. |
| S-47 | 8 | `A53:O53` | PASS | PARTIAL | [B], [FIN], [FIN-R] | Nhập chi/CSV/chờ phân bổ có test; NFR còn cần chốt có nối hóa đơn hay chỉ ghi nhận. |
| S-48 | 8 | `A54:O54` | PASS | PARTIAL | [B], [FIN], [FIN-R] | AC ghi rõ chi >80% và nghiệm thu <80%, code/bộ đáp án theo đó; NFR lại hỏi phần trăm hay tuyệt đối. Giữ AC 80%, ghi cần làm rõ thay vì tự thêm ngưỡng mới. |
| S-49 | 8 | `A58:O58` | PASS | PARTIAL | [B], [FIN], [FIN-R] | AC ghi rõ % theo giá trị hợp đồng, code theo đó; NFR lại hỏi khối lượng hay giá trị. Giữ công thức theo giá trị, chờ chốt mâu thuẫn văn bản. |
| S-50 | 8 | `A59:O59` | PASS | PARTIAL | [B], [FIN], [FIN-R] | PDF nội bộ có ảnh/thời điểm/GPS/người lập/duyệt; NFR còn cần chốt mẫu biểu hoàn công chính thức. |
| S-51 | 8 | `A4:O4` | PARTIAL | PARTIAL | [MONITOR], [B] | Health/timeout/monitor >300 giây/retry/recovery local PASS; chưa có host monitor độc lập và bằng chứng cả team nhận cảnh báo staging; kênh chưa chốt. |

## Cổng DoD chung chưa đủ bằng chứng

Nguồn bắt buộc là sheet **DoD-DoR!A2:C10** trong [workbook trích gốc](audit-original-workbook.json), không phải tiêu chí tự thêm của lượt audit:

| DoD gốc | Bằng chứng hiện có / phần thiếu |
| --- | --- |
| Thành viên khác duyệt code (hàng 2) | Chưa có approval độc lập cho bản local hiện tại. Test xanh không thay approval. |
| Unit cho nhánh mới, coverage phần đổi không giảm (hàng 3) | Có [coverage summary](../sprint6-8/coverage-summary.json), nhưng [báo cáo triển khai](../sprint6-8-implementation-report.md) ghi chưa có baseline main hợp lệ để so sánh. Thiếu bằng chứng không giảm coverage; không coi “có coverage” là đủ. |
| CI xanh build/lint/typecheck/test (hàng 4) | Có cấu hình [CI], lint/test/build local và lượt logout mới [LOGOUT]. Chưa có remote run cho bản chưa commit; chưa cấu hình typecheck riêng theo chính báo cáo triển khai. Lint không chứng minh typecheck. Không tự suy ra bắt buộc chuyển dự án sang TypeScript. |
| Không secret, quét phụ thuộc sạch (hàng 5) | [Secret scan](secret-scan.json) lịch sử PASS. [Audit mới hơn](logout/dependency-audit-summary.json) ghi backend production 0, frontend 0, backend đầy đủ **19 moderate**; gốc từ [sprintf-js trong dev/Jest](logout/backend-full-audit.json). Nó mới hơn mục full-backend 0 trong [tổng hợp cũ](validation-summary.json). CI chặn high/critical cho full-backend nên có thể xanh khi moderate còn tồn tại; chưa đạt cách viết “quét sạch” của DoD. Không dùng đề xuất downgrade Jest như bản vá đã được chứng minh. |
| AC trên staging, không chỉ local (hàng 6) | Docker local/restore riêng [DOCKER] PASS; chưa có staging/cloud HTTPS và AC run trên đó. |
| Thuật toán/lịch có đáp án tính tay (hàng 7) | Bộ đáp án cứng và mutation đã có; còn nguồn tính tay và người thứ hai kiểm S-10. Rủi ro R-01 cùng nguồn nhấn mạnh tính trước mã và kiểm độc lập. |
| Khối lượng/tiền có test concurrent (hàng 8) | Có [B]/[FIN] và test đồng thời cho chống vượt/khóa/duplicate. Giữ PASS kỹ thuật, không chạy lại DB chỉ để viết audit. |
| Offline ngắt/nối mạng trên CI (hàng 9) | [PWA] local có 20 mục/30 ảnh và replay; chưa có remote CI run theo S-34. |
| Màn hình hiện trường đã thử điện thoại thật (hàng 10) | Có UAT Samsung sử dụng chung và standalone lịch sử [SAMSUNG-R], không thay bằng chứng riêng camera/queue survival/closed-app sync/điều kiện ánh nắng-găng. Không yêu cầu lặp lại UAT đã xác nhận. |

Kết quả logout ngày 20/10 chỉ bổ sung cho phạm vi đã ghi ở [LOGOUT]. Không cộng lại các bộ test lịch sử thành một “full suite hiện tại”, không cộng trùng backend 374 với targeted 55 hoặc 5. Build logout đã được chuẩn bị và phục vụ trên host 3082/4174 theo [checkpoint kết nối](connectivity/README.md); chưa xác minh hoặc activate worker trên điện thoại.

## Khác biệt yêu cầu cần giữ nguyên để quyết định

1. **S-04 — quyền tạo dự án.** AC `Backlog!L8` cho Ban quản lý tạo; chính sách Super Admin sau đó đã được chủ hệ thống chọn, ghi ở [báo cáo hợp nhất](../FINAL-INTEGRATION-SPRINT1-8.md). Không đổi phân quyền để làm xanh workbook. Cần ghi quyết định sản phẩm nào thay AC nào.
2. **S-23 — MB/MiB.** `L34` dùng MB, [PHOTO] dùng 1.048.576 byte và [PWA-R] dùng MiB. Làm rõ đơn vị hoặc bảo đảm giới hạn chặt hơn với boundary test; fixture hiện có đạt cả hai nên không tuyên bố đã có lỗi người dùng.
3. **S-48 — ngưỡng.** `L54` ghi rõ >80% chi và <80% nghiệm thu, `N54` còn hỏi phần trăm hay tuyệt đối. Duy trì 80% theo AC, không sáng tạo cấu hình/ngưỡng mới để tự giải mâu thuẫn.
4. **S-49 — tiến độ.** `L58` ghi theo giá trị hợp đồng, `N58` còn hỏi khối lượng hay giá trị. Duy trì công thức theo giá trị đã triển khai; baseline thiếu ngữ cảnh vẫn phải hiện chưa xác định.
5. **S-01 — auto-deploy.** AC muốn merge-main tự deploy; [CI] hiện chỉ validate staging và Render auto-deploy off theo phạm vi đã cho phép. Đây là khoảng trống nghiệm thu có chủ đích, không phải quyền để tự publish.
6. **S-35–S-51 — refinement.** Nguồn để Later/SP thô. Các lựa chọn mở được nêu đúng từng Story trong bảng và [báo cáo triển khai](../sprint6-8-implementation-report.md): ảnh bắt buộc, điều chỉnh âm/hủy/credit, lưu audit, quyền GPS, radius, cấp duyệt, trần tạm giữ, cấu trúc dự toán, hóa đơn, mẫu PDF và kênh cảnh báo. Không biến giả định triển khai thành quyết định đã duyệt.

## Việc tiếp theo có thể chuẩn bị local, không làm lại phần đã PASS

- Host đã khôi phục; hoàn tất HTTP/UI Samsung khi có thiết bị, giữ origin `localhost:4174`, đúng copy/build và reverse. Không Clear storage/cache, unregister, reinstall, đổi origin hoặc tự sync.
- Đã bổ sung 3 kiểm thử và phép đo mới S-11/S-16 trên fixture bộ nhớ biệt lập, không mã production/DB/HTTP/thiết bị. S-11 đạt ngưỡng local; còn S-16 browser vẫn tương tác/hiện kết quả <5 giây và WBS/CPM/Gantt theo 500 phần tử trên môi trường nghiệm thu.
- Chuẩn bị baseline coverage có thể so sánh và phương án typecheck phù hợp JavaScript; nêu rõ nhánh/lượng code đo và lệnh kiểm. Không báo PASS khi chỉ có lint hoặc coverage hiện tại.
- Xử lý/chốt ngoại lệ dependency dev có truy vết sau khi kiểm bản vá tương thích; không ép major downgrade hoặc sửa audit JSON. Ngoại lệ là quyết định riêng, không đổi DoD gốc thành “đã quét sạch”.
- Lập phiếu quyết định cho các mâu thuẫn/refinement ở trên, kèm nguồn ô. Giữ nguyên công thức/quyền đang được duyệt cho đến khi có quyết định mới.
- Chuẩn bị checklist phát hành và gói evidence theo [Render readiness](RENDER-READINESS.md). Chưa có phép thì không commit/push, tạo cloud database/service, upload backup, deploy hoặc gửi thông báo team.

## Đối chiếu với Render readiness

[RENDER-READINESS](RENDER-READINESS.md) vẫn đúng về các việc chưa xong: phiên bản được review/remote CI, cloud PostgreSQL riêng + restore/đối chiếu, HTTPS/Secure cookie/deep links/PWA/ảnh/PDF, bằng chứng Samsung riêng, backup lịch đêm và monitor/kênh team. Bổ sung hai mục DoD còn bị lược trong checklist đó: **typecheck riêng** và **so sánh coverage với baseline hợp lệ**. Bổ sung chronology audit **19 moderate dev** để không dùng con số full-backend 0 cũ làm kết luận hiện hành.

Không dùng trạng thái health, dung lượng ổ đĩa, PID hoặc gate ngày 15/10 như trạng thái live ngày 20/10. Không nâng cấp hai database nguồn, restore đè copy, sửa tài khoản/quyền hoặc xóa dữ liệu offline để đạt tiêu chí.

[B]: backend-all-tests.json
[UI]: ../sprint4-5/ui-regression-results.json
[CPM]: ../sprint-2-result.md
[GANTT]: ../sprint3/HANDOFF.md
[PWA]: ../sprint4-5/playwright-results.json
[PWA-R]: ../sprint4-5/SPRINT4_SPRINT5_REPORT.md
[PHOTO]: ../../frontend/src/services/photoCompression.js
[FIN]: ../sprint6-8/new-stories-results.json
[FIN-R]: ../sprint6-8-implementation-report.md
[DOCKER]: docker-merged-uat.json
[CI]: ../../.github/workflows/ci.yml
[BACKUP]: merged-backup-restore.json
[BACKUP-R]: ../sprint3/T46-T47-BACKUP-RESTORE.md
[SAMSUNG]: samsung-webapk-recovery.json
[SAMSUNG-R]: samsung-owner-uat.json
[MONITOR]: ../sprint6-8/S51-HEALTH-MONITORING.md
[LOGOUT]: logout/resume-validation.json
[LOCAL-AC]: connectivity/local-ac-performance.json

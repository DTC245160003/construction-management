# Sprint 6–8: original requirements and reconciliation

## Interpretation and prompt differences

| Story | Workbook detail that governs implementation | Prompt additions or differences |
| --- | --- | --- |
| S-35 | Parent contract value is the sum of leaf values; direct parent entry is forbidden (L9). Quantity and price use exact decimals (N9). | Prompt says parent aggregation but omits the direct-entry prohibition; adds full database-to-UI implementation. |
| S-36 | Period quantity is current cumulative minus the previous **approved** cumulative; S-26 team totals appear beside entry (L43). Whether evidence photos are mandatory remains unresolved (N43). | Prompt describes cumulative subtraction less precisely and permits photo attachment without deciding whether it is mandatory. |
| S-37 | Reject excessive cumulative quantity when creating a form, with concrete figures. Concurrent creation cannot let both conflicting forms through (L44). The guarantee must be in PostgreSQL, using row locks or constraints, rather than application checks alone (N44). | Prompt speaks primarily of approved totals and adds explicit PostgreSQL transactions/concurrent tests. Draft reservation semantics are not specified in either source; document the implemented policy. |
| S-38 | Only approved forms count toward recognized cumulative quantity. Returned forms go back to the creator for correction. Approved originals are immutable; correction requires a separate adjustment form (L45). Negative adjustments remain an open refinement (N45). | Prompt introduces Draft/Pending/Approved/Returned workflow names and requires an adjustment process but does not define its signed quantity semantics. |
| S-39 | Every operation on acceptance, payments, contracts and journal closing records actor, time, before and after; no normal edit/delete API (L57). Retention duration remains unresolved (N57). | Prompt explicitly permits reuse of existing audit logs and adds object identifiers. |
| S-40 | Read and save time/GPS from original upload; show explicit absence (L46). Raw-coordinate viewer roles remain unresolved (N46). Original-image EXIF preservation is also required by S-23 N34. | Prompt explicitly forbids invented GPS and requires location access protection. |
| S-41 | Project has center/radius. Outside images show suspicion **and distance**, visible to the acceptance approver (L47). Radius should account for phone location accuracy, still unrefined (N47). | Prompt omits approver visibility and adds that warnings do not delete images or determine fraud. |
| S-42 | Flag missing camera metadata, exact phone-screen dimensions, or capture time too far from **acceptance date** (L48). Show confidence; indicators are not conclusive proof (N48). | Prompt uses broader screenshot/time language and asks for reasons. Numeric time limits, dimension list and confidence scale are unspecified: implementation defaults must be documented. |
| S-43 | Each line shows period quantity, unit price and amount; sum equals line total; one acceptance belongs to one payment (L49). Exact decimal money and documented rounding policy are required (N49). | Prompt makes active-payment uniqueness and transaction enforcement explicit. Read one-use together with S-44's returned-payment release exception. |
| S-44 | Approved payment and its linked acceptance forms are locked. Returned payment releases its acceptance forms for another proposal (L50). Approval levels remain unresolved (N50). | Prompt permits an authorized equivalent role and says release follows business rules; workbook defines the release behavior explicitly. |
| S-45 | Retention rate belongs to the **project**, described as the contract rate. Each proposal displays gross, retained and net; cumulative retention is visible (L51). Contract cap remains unresolved (N51). | Prompt adds protection from rounding error and double counting. It does not define a cap. |
| S-46 | Leaf budgets roll up through the tree. A change after actual spending exists creates a new version; old versions remain viewable (L52). Cost component breakdown remains unresolved (N52). | Prompt asks for version management on changes generally, which can be implemented more broadly without losing old versions. |
| S-47 | Daily amount, category and item; bulk CSV template; unassignable costs enter pending allocation (L53). Invoice integration remains unresolved (N53). | Prompt matches the core acceptance criterion and does not require invoice integration. |
| S-48 | Leaf comparisons roll up through the tree (Epics I11). Warning requires spend **strictly greater than 80%** and accepted quantity **strictly below 80%**. Include independent hand-calculated sample answers (L54). | Prompt matches the exact 80/80 criterion. Whether future thresholds are percent or absolute remains open (N54), not a reason to change the explicit acceptance boundary. |
| S-49 | Completion is by **contract value**; finish variance compares current schedule against the **original baseline**; show exceeded milestones and delayed critical tasks (L58). Dependencies are S-16 and S-19 (M58). | Prompt says planned completion generally. Workbook requires original baseline. N58 asks quantity/value as an open question, but L58 explicitly selects value. S-17 and Tasks I40 establish working-day variance after calendar support exists. |
| S-50 | One item's PDF includes all acceptance periods, cumulative quantity, evidence photos with time/GPS when present, creator and approver (L59). Official handover form remains unresolved (N59). | Prompt adds Vietnamese print support and permits a clearly identified internal template pending confirmation. |
| S-51 | Health endpoint reports application and database. After staging fails to respond for **more than five minutes**, **the whole team** receives a notification (L4). A channel the team reads remains unresolved (N4). | Prompt adds environment-configured channel/secrets and explicitly forbids claiming actual alert delivery verified without monitoring deployment. |

## Cross-sheet constraints and delivery limits

- `Thông tin!B9,B13`: the product goal includes correct contractual quantities and offline journals; financial records are contractual evidence and photo GPS is worker location data.
- `Sprints!D7:F9`: Sprint 6 guarantees cumulative accuracy under concurrent creation (19 planned SP); Sprint 7 links approved quantity, payment and photo evidence (20 SP); Sprint 8 compares item budgets/spend and exports handover evidence (20 SP). Total selected scope is 59 SP. S-35–S-39 are Must. S-43–S-44 are Must. S-42 is Could. Remaining selected stories are Should.
- `Epics!G4`: contract changes leave a trace. S-57 (`Backlog!L11:N11`) is a separate future approval workflow for contract changes, outside S-35–S-51; do not silently claim it is implemented merely because contract edits are audited.
- `Epics!I6` and `Backlog!L6:N6`: team leaders cannot see contract unit prices; project isolation occurs in server queries; unauthorized direct calls are rejected; routes deny access by default. New features retain existing role identities rather than inventing a second account system.
- `Epics!G8:I8`, `Rủi ro!B6:E6`, `DoD-DoR!C8`: database protection and parallel tests are required for quantity/money invariants, including concurrent form creation.
- `Epics!I9`: suspicious photos are flagged for human review, never automatically rejected solely because metadata is missing.
- `Epics!G10:I10`: payment equals approved quantity × contract price minus retention with zero reconciliation difference; every payment action is audited.
- `Epics!I11`: compare at leaves and aggregate upward; project-total comparison alone is insufficient.
- `Backlog!L30:N30`: S-26 team-reported quantity is a reference, can exceed planned quantity with a warning, and must not be treated as approved acceptance.
- `Backlog!N34`: retained originals preserve metadata; display compression must not destroy the original evidence.
- `Backlog!L35:N35`: journal locks are enforced at the server; unlocking requires a reason and audit history. Financial changes must preserve Sprint 1–5 PWA/offline behavior.
- `Backlog!L24:N27`, `Tasks!F39:I48`: use existing recalculated schedules, separate original baselines, working calendars and work-item milestone warnings. Do not derive the owner dashboard solely from newly created task milestones or calendar-day subtraction.
- `DoD-DoR!C2:C11`: at least one other member approves code review; unit coverage of changed logic does not decrease; CI build/lint/typecheck/tests pass; no secrets and dependency scan is clean; acceptance criteria pass on staging; hand-computed schedule/calendar answers and quantity/money concurrency tests exist; offline regression runs in CI when affected; field screens are verified on a real phone; README records public behavior, environment and operations changes.
- `DoD-DoR!C14:C17`: detailed Given/When/Then wording, refined estimates, task breakdown and shared understanding are guidance, not independent approval gates. The user's explicit continuous implementation request authorizes progress while unresolved refinements are recorded as assumptions.
- Workbook DoD therefore requires external staging, peer review, security scan and real-phone evidence. Local automated success alone cannot establish all workbook DoD. Report these unverified checks explicitly.

## Refinements requiring explicit implementation assumptions

Record defaults and limits in the implementation report for: draft reservation/release; negative adjustment treatment and paid-form constraints; mandatory photos; audit retention duration; raw-GPS viewer roles and export access; geofence/GPS tolerance; photo age/dimension/confidence heuristics; payment approval stages; retention cap; budget component breakdown; invoice integration; future alert configurability; missing original baseline; official PDF form; and actual staging notification delivery. No numeric threshold or legal retention period should be attributed to the workbook when it is absent.

Source of truth: `C:\Users\Lenovo\Downloads\Nền tảng điều hành thi công công trình.xlsx`. Read-only review of all seven sheets on 2026-10-14. The workbook was not modified. The implementation prompt is `Pasted text.txt` attached to this task. Original workbook acceptance criteria take precedence when the two differ.

## Workbook inventory

| Sheet | Nonempty range | Content reviewed |
| --- | --- | --- |
| Thông tin | A1:B14 | Product goal, contractual accuracy and worker location data |
| Sprints | A1:F9 | Eight sprint goals and capacity |
| Epics | A1:J12 | All 11 epics, dependencies and nonfunctional constraints |
| Backlog | A1:O60 | All 59 backlog rows, including all 17 selected stories |
| Tasks | A1:J48 | All 47 tasks; only Sprints 1–3 have detailed tasks |
| Rủi ro | A1:F11 | All 10 risks and mitigations |
| DoD-DoR | A1:C17 | All delivery/readiness requirements |

The seven drawing XML parts contain no text. There are no comment, table or external-link parts. Formatted empty rows extend beyond these ranges and contain no requirements.

## Exact original stories

The following text is extracted verbatim from Backlog cells. All 17 stories are tier Later, status Todo, owner “chưa phân”, and explicitly carry coarse, unrefined estimates.

### S-35: Khai báo khối lượng, đơn vị tính và đơn giá hợp đồng cho hạng mục lá

- Source: `Backlog!A9:O9`. Epic: E-03 (Cơ cấu công việc và hợp đồng khối lượng). Sprint 6; priority Must; 3 SP.
- Story (`K9`): Là ban quản lý dự án tôi muốn khai khối lượng, đơn vị tính và đơn giá hợp đồng cho từng hạng mục lá để có mốc cứng cho nghiệm thu và thanh toán bám vào
- Acceptance criteria (`L9`): Khai được khối lượng, đơn vị và đơn giá cho hạng mục lá; hạng mục cha hiện giá trị hợp đồng cộng từ các lá; hạng mục cha không khai trực tiếp được. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M9`): S-04
- Nonfunctional requirements / open refinement (`N9`): chưa refine — khối lượng và đơn giá lưu kiểu số thập phân chính xác, không dùng số thực dấu phẩy động

### S-36: Lập phiếu nghiệm thu theo đợt, tự tính khối lượng phát sinh trong đợt

- Source: `Backlog!A43:O43`. Epic: E-06 (Nghiệm thu khối lượng luỹ kế). Sprint 6; priority Must; 5 SP.
- Story (`K43`): Là kỹ sư giám sát tôi muốn lập phiếu nghiệm thu cho khối lượng đã làm trong đợt để làm căn cứ thanh toán mà không phải tự trừ luỹ kế bằng tay
- Acceptance criteria (`L43`): Phiếu ghi khối lượng luỹ kế tới thời điểm này cho từng hạng mục; hệ thống tự tính khối lượng đợt bằng hiệu với luỹ kế đợt trước đã duyệt; số đội đã báo ở S-26 hiện bên cạnh để đối chiếu; phiếu đính được ảnh hiện trường. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M43`): S-35, S-26
- Nonfunctional requirements / open refinement (`N43`): chưa refine — cần chốt phiếu có bắt buộc ảnh hiện trường hay không

### S-37: Luỹ kế nghiệm thu không vượt khối lượng hợp đồng, bảo đảm ở tầng cơ sở dữ liệu

- Source: `Backlog!A44:O44`. Epic: E-06 (Nghiệm thu khối lượng luỹ kế). Sprint 6; priority Must; 5 SP.
- Story (`K44`): Là chủ đầu tư tôi muốn hệ thống chặn nghiệm thu vượt hợp đồng để không thanh toán cho khối lượng không có trong hợp đồng
- Acceptance criteria (`L44`): Lập phiếu làm luỹ kế vượt khối lượng hợp đồng thì bị chặn kèm số liệu cụ thể; hai phiếu lập đồng thời cho cùng hạng mục không cùng lọt qua — có test chạy song song chứng minh. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M44`): S-36
- Nonfunctional requirements / open refinement (`N44`): chưa refine — bảo đảm chống vượt phải nằm ở tầng cơ sở dữ liệu (khoá dòng hoặc ràng buộc), không dựa vào kiểm tra ở tầng ứng dụng

### S-38: Ban quản lý duyệt hoặc trả lại phiếu nghiệm thu kèm lý do

- Source: `Backlog!A45:O45`. Epic: E-06 (Nghiệm thu khối lượng luỹ kế). Sprint 6; priority Must; 3 SP.
- Story (`K45`): Là ban quản lý dự án tôi muốn duyệt hoặc trả lại phiếu nghiệm thu để kiểm soát trước khi khối lượng được tính vào thanh toán
- Acceptance criteria (`L45`): Phiếu chỉ tính vào luỹ kế sau khi được duyệt; trả lại bắt buộc nhập lý do và phiếu quay về cho người lập sửa; phiếu đã duyệt không sửa được, muốn sửa phải lập phiếu điều chỉnh. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M45`): S-36
- Nonfunctional requirements / open refinement (`N45`): chưa refine — cần chốt phiếu điều chỉnh âm xử lý luỹ kế thế nào

### S-39: Nhật ký thao tác trên phiếu nghiệm thu và đề nghị thanh toán chỉ ghi thêm

- Source: `Backlog!A57:O57`. Epic: E-10 (Nhật ký hệ thống, báo cáo và thông báo). Sprint 6; priority Must; 3 SP.
- Story (`K57`): Là chủ đầu tư tôi muốn truy được ai đã lập, sửa và duyệt một phiếu để làm rõ trách nhiệm khi có tranh chấp
- Acceptance criteria (`L57`): Mọi thao tác trên phiếu nghiệm thu, đề nghị thanh toán, khối lượng hợp đồng và khoá sổ nhật ký đều có bản ghi kèm người, thời điểm và giá trị trước sau; bảng nhật ký không có API sửa hay xoá. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M57`): S-38
- Nonfunctional requirements / open refinement (`N57`): chưa refine — cần chốt thời gian lưu nhật ký, hồ sơ xây dựng thường phải giữ nhiều năm

### S-40: Ảnh lưu kèm thời điểm và toạ độ đọc từ siêu dữ liệu

- Source: `Backlog!A46:O46`. Epic: E-07 (Ảnh hiện trường chống giả mạo). Sprint 7; priority Should; 3 SP.
- Story (`K46`): Là ban quản lý dự án tôi muốn biết ảnh này chụp lúc nào ở đâu để đối chiếu với hồ sơ nghiệm thu
- Acceptance criteria (`L46`): Siêu dữ liệu thời gian và toạ độ được đọc từ ảnh gốc và lưu khi tải lên; hiện kèm ảnh khi xem; ảnh không có siêu dữ liệu thì ghi rõ là không có. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M46`): S-23
- Nonfunctional requirements / open refinement (`N46`): chưa refine — toạ độ người lao động là dữ liệu vị trí, cần chốt vai trò nào được xem toạ độ thô

### S-41: Ảnh chụp ngoài bán kính công trường bị đánh dấu nghi vấn

- Source: `Backlog!A47:O47`. Epic: E-07 (Ảnh hiện trường chống giả mạo). Sprint 7; priority Should; 3 SP.
- Story (`K47`): Là chủ đầu tư tôi muốn phát hiện ảnh chụp không phải tại công trường để không nghiệm thu dựa trên bằng chứng sai
- Acceptance criteria (`L47`): Dự án khai toạ độ tâm và bán kính công trường; ảnh có toạ độ nằm ngoài bán kính thì đánh dấu nghi vấn kèm khoảng cách; người duyệt phiếu thấy dấu này. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M47`): S-40
- Nonfunctional requirements / open refinement (`N47`): chưa refine — cần chốt bán kính chấp nhận, tính cả sai số định vị của điện thoại

### S-42: Ảnh thiếu siêu dữ liệu hoặc có dấu hiệu chụp lại màn hình bị đánh dấu

- Source: `Backlog!A48:O48`. Epic: E-07 (Ảnh hiện trường chống giả mạo). Sprint 7; priority Could; 3 SP.
- Story (`K48`): Là chủ đầu tư tôi muốn phát hiện ảnh chụp lại từ màn hình hoặc ảnh tải từ nơi khác để không nhận bằng chứng giả
- Acceptance criteria (`L48`): Ảnh thiếu siêu dữ liệu máy ảnh, có kích thước đúng bằng màn hình điện thoại, hoặc thời điểm chụp cách ngày nghiệm thu quá xa thì bị đánh dấu để người duyệt xem kỹ. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M48`): S-40
- Nonfunctional requirements / open refinement (`N48`): chưa refine — đây là phát hiện theo dấu hiệu, không phải bằng chứng chắc chắn; phải ghi rõ mức độ tin cậy

### S-43: Đề nghị thanh toán sinh từ phiếu nghiệm thu đã duyệt nhân đơn giá

- Source: `Backlog!A49:O49`. Epic: E-08 (Thanh toán theo tiến độ). Sprint 7; priority Must; 5 SP.
- Story (`K49`): Là ban quản lý dự án tôi muốn đề nghị thanh toán tự sinh từ các phiếu nghiệm thu đã duyệt trong kỳ để không phải cộng tay và không cộng nhầm
- Acceptance criteria (`L49`): Đề nghị liệt kê từng hạng mục kèm khối lượng đợt, đơn giá và thành tiền; tổng khớp tổng các dòng; một phiếu nghiệm thu chỉ vào được một đề nghị. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M49`): S-38
- Nonfunctional requirements / open refinement (`N49`): chưa refine — tiền lưu kiểu số thập phân chính xác, làm tròn theo quy tắc ghi rõ trong tài liệu

### S-44: Chủ đầu tư duyệt hoặc trả lại đề nghị thanh toán, đã duyệt không sửa được

- Source: `Backlog!A50:O50`. Epic: E-08 (Thanh toán theo tiến độ). Sprint 7; priority Must; 3 SP.
- Story (`K50`): Là chủ đầu tư tôi muốn duyệt đề nghị thanh toán để kiểm soát dòng tiền theo tiến độ thật
- Acceptance criteria (`L50`): Duyệt hoặc trả lại kèm lý do; đề nghị đã duyệt khoá cứng, phiếu nghiệm thu trong đó cũng khoá theo; trả lại thì phiếu nghiệm thu được giải phóng để vào đề nghị khác. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M50`): S-43
- Nonfunctional requirements / open refinement (`N50`): chưa refine — cần chốt quy trình duyệt có mấy cấp

### S-45: Phần tạm giữ theo hợp đồng được trừ đúng trên mỗi đề nghị

- Source: `Backlog!A51:O51`. Epic: E-08 (Thanh toán theo tiến độ). Sprint 7; priority Should; 3 SP.
- Story (`K51`): Là kế toán của chủ đầu tư tôi muốn hệ thống tự trừ phần tạm giữ bảo hành theo tỉ lệ hợp đồng để số tiền thực trả đúng ngay từ đầu, không phải sửa tay
- Acceptance criteria (`L51`): Dự án khai tỉ lệ tạm giữ; mỗi đề nghị hiện thành tiền, phần tạm giữ và số thực trả; tổng tạm giữ luỹ kế xem được. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M51`): S-43
- Nonfunctional requirements / open refinement (`N51`): chưa refine — cần chốt tạm giữ có trần theo hợp đồng hay không

### S-46: Nhập dự toán theo hạng mục lá, cộng lên theo cây

- Source: `Backlog!A52:O52`. Epic: E-09 (Dự toán, thực chi và vật tư). Sprint 8; priority Should; 3 SP.
- Story (`K52`): Là ban quản lý dự án tôi muốn nhập dự toán cho từng hạng mục lá để có mốc so với chi phí thực tế
- Acceptance criteria (`L52`): Nhập dự toán cho hạng mục lá; tổng dự toán cộng lên theo cây; dự toán đổi sau khi đã có thực chi thì lưu thành phiên bản mới, phiên bản cũ vẫn xem được. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M52`): S-35
- Nonfunctional requirements / open refinement (`N52`): chưa refine — cần chốt dự toán tách vật tư, nhân công, máy hay chỉ một số tổng

### S-47: Ghi nhận chi phí thực tế gắn với hạng mục

- Source: `Backlog!A53:O53`. Epic: E-09 (Dự toán, thực chi và vật tư). Sprint 8; priority Should; 3 SP.
- Story (`K53`): Là ban quản lý dự án tôi muốn ghi các khoản chi thực tế gắn với hạng mục để có số so với dự toán
- Acceptance criteria (`L53`): Ghi khoản chi với ngày, số tiền, loại chi và hạng mục; nhập hàng loạt từ tệp CSV theo mẫu; khoản chi không gắn được hạng mục thì vào mục chờ phân bổ. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M53`): S-46
- Nonfunctional requirements / open refinement (`N53`): chưa refine — cần chốt có nối với hoá đơn đầu vào hay chỉ ghi nhận

### S-48: Bảng so dự toán với thực chi, cảnh báo hạng mục vượt ngưỡng

- Source: `Backlog!A54:O54`. Epic: E-09 (Dự toán, thực chi và vật tư). Sprint 8; priority Should; 5 SP.
- Story (`K54`): Là ban quản lý dự án tôi muốn được cảnh báo khi một hạng mục sắp vượt dự toán để xử lý trước khi vượt hẳn
- Acceptance criteria (`L54`): Bảng so dự toán với thực chi theo hạng mục và cộng dồn theo cây; hạng mục chi quá 80% dự toán mà khối lượng nghiệm thu chưa tới 80% thì đánh dấu rõ; có bộ dữ liệu mẫu với đáp án tính tay. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M54`): S-47
- Nonfunctional requirements / open refinement (`N54`): chưa refine — cần chốt ngưỡng cảnh báo theo phần trăm hay theo số tuyệt đối

### S-49: Trang tổng hợp tiến độ cho chủ đầu tư

- Source: `Backlog!A58:O58`. Epic: E-10 (Nhật ký hệ thống, báo cáo và thông báo). Sprint 8; priority Should; 3 SP.
- Story (`K58`): Là chủ đầu tư tôi muốn xem một trang tổng hợp tiến độ để nắm tình hình mà không phải đọc từng công việc
- Acceptance criteria (`L58`): Trang tổng hợp có phần trăm hoàn thành theo giá trị hợp đồng, chênh lệch ngày hoàn thành so với kế hoạch gốc, các mốc đang bị vượt, và các việc găng đang chậm. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M58`): S-16, S-19
- Nonfunctional requirements / open refinement (`N58`): chưa refine — cần chốt cách tính phần trăm hoàn thành, theo khối lượng hay theo giá trị

### S-50: Xuất hồ sơ nghiệm thu của một hạng mục ra tệp PDF

- Source: `Backlog!A59:O59`. Epic: E-10 (Nhật ký hệ thống, báo cáo và thông báo). Sprint 8; priority Should; 3 SP.
- Story (`K59`): Là ban quản lý dự án tôi muốn xuất hồ sơ nghiệm thu ra tệp để đính vào hồ sơ hoàn công
- Acceptance criteria (`L59`): Tệp xuất ra có phiếu nghiệm thu các đợt, khối lượng luỹ kế, ảnh hiện trường kèm thời điểm và toạ độ, người lập và người duyệt. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M59`): S-38, S-40
- Nonfunctional requirements / open refinement (`N59`): chưa refine — cần chốt mẫu biểu theo yêu cầu hồ sơ hoàn công

### S-51: Giám sát sức khoẻ hệ thống và cảnh báo khi staging ngừng

- Source: `Backlog!A4:O4`. Epic: E-01 (Hạ tầng, CI/CD và vận hành môi trường). Sprint 8; priority Should; 3 SP.
- Story (`K4`): Là thành viên phát triển tôi muốn biết ngay khi staging ngừng phản hồi để không đợi tới Daily Scrum mới phát hiện cả team đã mất một buổi không test được
- Acceptance criteria (`L4`): Có điểm kiểm tra sống trả về trạng thái ứng dụng và cơ sở dữ liệu; staging không phản hồi quá 5 phút thì cả team nhận được thông báo. Chưa refine chi tiết — tier Later, SP thô
- Dependencies (`M4`): S-01
- Nonfunctional requirements / open refinement (`N4`): chưa refine — cần chốt kênh nhận cảnh báo mà cả team thật sự đọc

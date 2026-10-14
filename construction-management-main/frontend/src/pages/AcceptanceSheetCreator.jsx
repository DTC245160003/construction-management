import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { Modal, Notice, Empty, NoProject } from "../components/OperationsUI";
import { validProjectId } from "../services/navigation";
import { dateLabel, numberLabel, today } from "../services/operationsApi";
import {
  fetchAcceptanceSheets,
  fetchSheetPreparationData,
  fetchAcceptanceSheetDetail,
  createAcceptanceSheet,
} from "../services/acceptanceSheetApi";
import "../styles/AcceptanceSheet.css";

export default function AcceptanceSheetCreator() {
  const [params] = useSearchParams();
  const projectId = params.get("projectId");

  const [sheets, setSheets] = useState([]);
  const [prepItems, setPrepItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  // Form state
  const [periodNumber, setPeriodNumber] = useState("");
  const [sheetDate, setSheetDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [inputCumulativeMap, setInputCumulativeMap] = useState({});
  const [inputPhotosMap, setInputPhotosMap] = useState({});

  // View detail modal
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!validProjectId(projectId)) return;
    loadData();
  }, [projectId]);

  async function loadData() {
    setLoading(true);
    try {
      const [sheetsRes, prepRes] = await Promise.all([
        fetchAcceptanceSheets(projectId),
        fetchSheetPreparationData(projectId),
      ]);
      setSheets(sheetsRes?.sheets || []);
      setPrepItems(prepRes?.items || []);

      // Khởi tạo input cumulative mặc định bằng previous_approved_cumulative hoặc để trống
      const initialMap = {};
      (prepRes?.items || []).forEach((item) => {
        initialMap[item.work_item_id] = "";
      });
      setInputCumulativeMap(initialMap);
    } catch (err) {
      setNotice({ tone: "error", message: err.message || "Không thể tải dữ liệu nghiệm thu" });
    } finally {
      setLoading(false);
    }
  }

  function handleCumulativeChange(workItemId, val) {
    setInputCumulativeMap((prev) => ({
      ...prev,
      [workItemId]: val,
    }));
  }

  function handlePhotosChange(workItemId, urlStr) {
    setInputPhotosMap((prev) => ({
      ...prev,
      [workItemId]: urlStr,
    }));
  }

  // Real-time calculation helper
  function computePeriodQty(currentValStr, previousApprovedStr) {
    if (!currentValStr || isNaN(Number(currentValStr))) return null;
    const cur = Number(currentValStr);
    const prev = Number(previousApprovedStr || 0);
    return cur - prev;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!periodNumber.trim()) {
      setNotice({ tone: "error", message: "Vui lòng nhập số đợt nghiệm thu (ví dụ: Đợt 1, Đợt 2...)" });
      return;
    }

    // Lọc các hạng mục mà người dùng đã nhập số lũy kế
    const itemsToSubmit = prepItems
      .filter((item) => {
        const val = inputCumulativeMap[item.work_item_id];
        return val !== undefined && val !== "" && !isNaN(Number(val));
      })
      .map((item) => {
        const photoRaw = inputPhotosMap[item.work_item_id] || "";
        const photos = photoRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        return {
          work_item_id: item.work_item_id,
          current_cumulative: inputCumulativeMap[item.work_item_id],
          site_photos: photos,
        };
      });

    if (itemsToSubmit.length === 0) {
      setNotice({
        tone: "error",
        message: "Vui lòng nhập Khối lượng lũy kế cho ít nhất một hạng mục công việc.",
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      await createAcceptanceSheet({
        project_id: Number(projectId),
        period_number: periodNumber.trim(),
        sheet_date: sheetDate,
        notes: notes.trim(),
        items: itemsToSubmit,
      });

      setNotice({
        tone: "success",
        message: `Đã lập thành công phiếu nghiệm thu ${periodNumber.trim()} với ${itemsToSubmit.length} hạng mục!`,
      });

      // Reset form
      setPeriodNumber("");
      setNotes("");
      const resetMap = {};
      prepItems.forEach((item) => {
        resetMap[item.work_item_id] = "";
      });
      setInputCumulativeMap(resetMap);
      setInputPhotosMap({});

      // Tải lại danh sách
      await loadData();
    } catch (err) {
      setNotice({ tone: "error", message: err.message || "Lỗi khi lưu phiếu nghiệm thu" });
    } finally {
      setSubmitting(false);
    }
  }

  async function viewDetail(sheetId) {
    setDetailLoading(true);
    try {
      const res = await fetchAcceptanceSheetDetail(sheetId);
      setSelectedSheet(res?.sheet || null);
    } catch (err) {
      setNotice({ tone: "error", message: err.message || "Không thể tải chi tiết phiếu" });
    } finally {
      setDetailLoading(false);
    }
  }

  if (!validProjectId(projectId)) {
    return (
      <DashboardLayout title="Phiếu nghiệm thu theo đợt (S-36)">
        <NoProject />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Lập phiếu nghiệm thu theo đợt (Story S-36)"
      description="Lập phiếu nghiệm thu khối lượng theo đợt, tự động tính khối lượng phát sinh và đối chiếu báo cáo đội thi công (S-26)."
    >
      <div className="acceptance-sheet-page">
        {notice && (
          <Notice tone={notice.tone}>
            {notice.message}
          </Notice>
        )}

        {/* Form Lập phiếu */}
        <section className="sheet-form-card">
          <div className="acceptance-sheet-toolbar">
            <h2>Lập Phiếu Nghiệm Thu Mới</h2>
            <span className="ops-muted">Số hạng mục hợp đồng khả dụng: {prepItems.length}</span>
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: "16px" }}>
            <div className="sheet-form-grid">
              <div className="sheet-form-field">
                <label htmlFor="periodNumber">Số đợt nghiệm thu *</label>
                <input
                  id="periodNumber"
                  type="text"
                  placeholder="Ví dụ: Đợt 1, Đợt 2, Nghiệm thu cọc..."
                  value={periodNumber}
                  onChange={(e) => setPeriodNumber(e.target.value)}
                  required
                />
              </div>

              <div className="sheet-form-field">
                <label htmlFor="sheetDate">Ngày lập phiếu *</label>
                <input
                  id="sheetDate"
                  type="date"
                  value={sheetDate}
                  onChange={(e) => setSheetDate(e.target.value)}
                  required
                />
              </div>

              <div className="sheet-form-field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="notes">Ghi chú đợt nghiệm thu</label>
                <textarea
                  id="notes"
                  rows={2}
                  placeholder="Ghi chú về biên bản, vị trí hiện trường, điều kiện thi công..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Bảng hạng mục đối chiếu & nhập khối lượng */}
            <h3 style={{ fontSize: "1rem", marginTop: "20px", marginBottom: "8px", color: "#334155" }}>
              Chi tiết hạng mục & Khối lượng phát sinh tự tính
            </h3>
            <p className="ops-muted" style={{ fontSize: "0.825rem", marginBottom: "12px" }}>
              💡 Nhập <strong>Lũy kế đợt này</strong> để hệ thống tự động tính khối lượng phát sinh đợt này theo công thức:{" "}
              <code>Khối lượng đợt này = Lũy kế đợt này - Lũy kế đã duyệt đợt trước</code>.
            </p>

            {loading ? (
              <p>Đang tải danh sách hạng mục...</p>
            ) : prepItems.length === 0 ? (
              <Empty>
                Chưa có hạng mục công việc lá hoặc chưa khai báo hợp đồng. Vui lòng kiểm tra màn hình Khai báo hợp đồng (S-35).
              </Empty>
            ) : (
              <div className="ops-table-scroll">
                <table className="sheet-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: "22%" }}>Hạng mục (S-35)</th>
                      <th style={{ width: "8%" }}>ĐVT</th>
                      <th style={{ width: "12%" }}>Hợp đồng</th>
                      <th style={{ width: "15%" }} className="col-s26-reported">
                        Đội đã báo (S-26) ℹ️
                      </th>
                      <th style={{ width: "13%" }}>Lũy kế đã duyệt</th>
                      <th style={{ width: "15%" }}>Lũy kế đợt này *</th>
                      <th style={{ width: "15%" }}>Khối lượng đợt này (Preview)</th>
                      <th style={{ width: "15%" }}>Ảnh hiện trường (URLs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prepItems.map((item) => {
                      const curVal = inputCumulativeMap[item.work_item_id];
                      const periodQty = computePeriodQty(curVal, item.previous_approved_cumulative);

                      return (
                        <tr key={item.work_item_id}>
                          <td>
                            <strong>{item.item_name}</strong>
                          </td>
                          <td>{item.unit}</td>
                          <td>
                            {numberLabel(item.contract_quantity)} {item.unit}
                          </td>
                          <td className="col-s26-reported">
                            <span className="badge-s26">S-26</span>
                            <strong>{numberLabel(item.reported_quantity)}</strong> {item.unit}
                          </td>
                          <td className="col-prev-approved">
                            {numberLabel(item.previous_approved_cumulative)} {item.unit}
                          </td>
                          <td className="col-current-input">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              placeholder="Nhập lũy kế..."
                              value={curVal ?? ""}
                              onChange={(e) => handleCumulativeChange(item.work_item_id, e.target.value)}
                            />
                          </td>
                          <td className="col-period-preview">
                            {periodQty === null ? (
                              <span className="badge-zero">—</span>
                            ) : (
                              <span
                                className={
                                  periodQty > 0
                                    ? "badge-positive"
                                    : periodQty === 0
                                    ? "badge-zero"
                                    : "badge-negative"
                                }
                              >
                                {periodQty > 0 ? `+${numberLabel(periodQty)}` : numberLabel(periodQty)} {item.unit}
                              </span>
                            )}
                          </td>
                          <td className="photo-input-cell">
                            <input
                              type="text"
                              placeholder="URL ảnh 1, URL 2..."
                              value={inputPhotosMap[item.work_item_id] || ""}
                              onChange={(e) => handlePhotosChange(item.work_item_id, e.target.value)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="submit"
                className="ops-btn ops-primary"
                disabled={submitting || loading || prepItems.length === 0}
              >
                {submitting ? "Đang lưu phiếu..." : "💾 Lưu Phiếu Nghiệm Thu (S-36)"}
              </button>
            </div>
          </form>
        </section>

        {/* Danh sách các phiếu đã lập */}
        <section className="sheet-list-card">
          <div className="acceptance-sheet-toolbar">
            <h2>Lịch Sử Phiếu Nghiệm Thu Theo Đợt</h2>
            <button type="button" className="ops-btn" onClick={loadData}>
              🔄 Làm mới
            </button>
          </div>

          {sheets.length === 0 ? (
            <Empty>Chưa có phiếu nghiệm thu nào được tạo cho dự án này.</Empty>
          ) : (
            <div className="ops-table-scroll" style={{ marginTop: "12px" }}>
              <table className="sheet-items-table">
                <thead>
                  <tr>
                    <th>Số đợt</th>
                    <th>Ngày lập</th>
                    <th>Người lập</th>
                    <th>Số hạng mục</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((sheet) => (
                    <tr key={sheet.id}>
                      <td>
                        <strong>{sheet.period_number}</strong>
                        {sheet.notes && <p className="ops-muted" style={{ margin: "2px 0 0", fontSize: "0.8rem" }}>{sheet.notes}</p>}
                      </td>
                      <td>{dateLabel(sheet.sheet_date)}</td>
                      <td>{sheet.creator_name || "Hệ thống"}</td>
                      <td>{sheet.items ? sheet.items.length : 0} hạng mục</td>
                      <td>
                        <span className={`sheet-status-badge status-${sheet.status}`}>
                          {sheet.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ops-btn ops-small"
                          onClick={() => viewDetail(sheet.id)}
                        >
                          👁️ Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal chi tiết phiếu */}
        {selectedSheet && (
          <Modal
            title={`Chi tiết phiếu: ${selectedSheet.period_number}`}
            onClose={() => setSelectedSheet(null)}
          >
            <div className="detail-modal-body">
              <dl className="ops-details-list">
                <dt>Đợt nghiệm thu</dt>
                <dd><strong>{selectedSheet.period_number}</strong></dd>
                <dt>Ngày nghiệm thu</dt>
                <dd>{dateLabel(selectedSheet.sheet_date)}</dd>
                <dt>Trạng thái</dt>
                <dd>
                  <span className={`sheet-status-badge status-${selectedSheet.status}`}>
                    {selectedSheet.status}
                  </span>
                </dd>
                <dt>Người lập</dt>
                <dd>{selectedSheet.creator_name || "—"}</dd>
                {selectedSheet.notes && (
                  <>
                    <dt>Ghi chú</dt>
                    <dd>{selectedSheet.notes}</dd>
                  </>
                )}
              </dl>

              <h4 style={{ marginTop: "16px", marginBottom: "8px" }}>Danh sách hạng mục nghiệm thu</h4>
              <div className="ops-table-scroll">
                <table className="sheet-items-table">
                  <thead>
                    <tr>
                      <th>Hạng mục</th>
                      <th>Lũy kế trước</th>
                      <th>Lũy kế đợt này</th>
                      <th>Khối lượng đợt này</th>
                      <th>Ảnh hiện trường</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedSheet.items || []).map((it) => (
                      <tr key={it.id}>
                        <td>
                          <strong>{it.item_name}</strong>
                        </td>
                        <td>{numberLabel(it.previous_approved_cumulative)} {it.unit}</td>
                        <td><strong>{numberLabel(it.current_cumulative)}</strong> {it.unit}</td>
                        <td className="col-period-preview">
                          <span className="badge-positive">
                            +{numberLabel(it.period_qty)} {it.unit}
                          </span>
                        </td>
                        <td>
                          {it.site_photos && Array.isArray(it.site_photos) && it.site_photos.length > 0 ? (
                            <div className="photo-thumb-row">
                              {it.site_photos.map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="photo-thumb-link"
                                >
                                  Ảnh #{idx + 1}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="ops-muted">Không có ảnh</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}

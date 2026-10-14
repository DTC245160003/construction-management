const { parseDecimal, scaled, formatScaled } = require("../utils/contractDecimal");

const SCALE_QTY = 4;

function calculatePeriodQty(currentCumulative, previousCumulative) {
    const curBig = scaled(currentCumulative, SCALE_QTY);
    const prevBig = scaled(previousCumulative, SCALE_QTY);
    const diffBig = curBig - prevBig;
    return formatScaled(diffBig, SCALE_QTY);
}

function createProblem(status, message) {
    const err = new Error(message);
    err.status = status;
    err.expose = true;
    return err;
}

function createAcceptanceSheetService({ model, pool }) {
    return {
        // Lấy danh sách phiếu
        async listSheets(projectId) {
            if (!projectId) {
                throw createProblem(400, "projectId là bắt buộc");
            }
            return model.listSheets(projectId);
        },

        // Lấy chi tiết phiếu
        async getSheetById(id) {
            const sheet = await model.getSheetById(id);
            if (!sheet) {
                throw createProblem(404, "Không tìm thấy phiếu nghiệm thu");
            }
            return sheet;
        },

        // Lấy dữ liệu mẫu cho form lập phiếu: gồm danh sách hạng mục lá, khối lượng hợp đồng, khối lượng đội báo (S-26), lũy kế đã duyệt gần nhất
        async getPreparationData(projectId) {
            if (!projectId) {
                throw createProblem(400, "projectId là bắt buộc");
            }
            return model.getSheetInputData(projectId);
        },

        // Tạo mới phiếu nghiệm thu kèm tính toán period_qty
        async createSheet(projectId, actorId, payload) {
            const { period_number, sheet_date, status = "DRAFT", notes = "", items = [] } = payload || {};

            if (!projectId) {
                throw createProblem(400, "projectId là bắt buộc");
            }

            if (!period_number || !String(period_number).trim()) {
                throw createProblem(400, "Số đợt nghiệm thu (period_number) không được để trống");
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                throw createProblem(400, "Danh sách hạng mục nghiệm thu không được rỗng");
            }

            const validStatuses = ["DRAFT", "APPROVED", "REJECTED"];
            const normalizedStatus = String(status).toUpperCase();
            if (!validStatuses.includes(normalizedStatus)) {
                throw createProblem(400, `Trạng thái không hợp lệ (${status}). Chấp nhận: ${validStatuses.join(", ")}`);
            }

            // Client/Connection handling for Transaction
            const client = pool ? await pool.connect() : null;
            try {
                if (client) await client.query("BEGIN");

                const processedItems = [];

                for (const rawItem of items) {
                    if (!rawItem.work_item_id) {
                        throw createProblem(400, "work_item_id là bắt buộc cho từng hạng mục");
                    }

                    // Validate & chuẩn hóa current_cumulative
                    let currentCumulativeStr;
                    try {
                        currentCumulativeStr = parseDecimal(rawItem.current_cumulative, SCALE_QTY, true);
                    } catch (e) {
                        throw createProblem(400, `Khối lượng lũy kế không hợp lệ ở hạng mục #${rawItem.work_item_id}: ${e.message}`);
                    }

                    if (currentCumulativeStr === null) {
                        throw createProblem(400, `Vui lòng nhập khối lượng lũy kế cho hạng mục #${rawItem.work_item_id}`);
                    }

                    // 1. Kiểm tra phiếu nghiệm thu đã duyệt (APPROVED) gần nhất của hạng mục đó
                    const prevApprovedStr = await model.getPreviousApprovedCumulative(projectId, rawItem.work_item_id);
                    const previousApprovedCumulative = parseDecimal(prevApprovedStr || "0", SCALE_QTY, true);

                    // 2 & 3. Tính period_qty = current_cumulative - previous_approved_cumulative
                    const periodQtyStr = calculatePeriodQty(currentCumulativeStr, previousApprovedCumulative);

                    // Validate site_photos mảng
                    let photos = rawItem.site_photos;
                    if (photos && typeof photos === "string") {
                        try { photos = JSON.parse(photos); } catch { photos = [photos]; }
                    }
                    if (!Array.isArray(photos)) {
                        photos = photos ? [photos] : [];
                    }

                    processedItems.push({
                        work_item_id: rawItem.work_item_id,
                        current_cumulative: currentCumulativeStr,
                        previous_approved_cumulative: previousApprovedCumulative,
                        period_qty: periodQtyStr,
                        site_photos: photos
                    });
                }

                const result = await model.createSheet(client, {
                    projectId,
                    periodNumber: String(period_number).trim(),
                    sheetDate: sheet_date || new Date().toISOString().slice(0, 10),
                    status: normalizedStatus,
                    notes: String(notes || "").trim(),
                    createdBy: actorId,
                    items: processedItems
                });

                if (client) await client.query("COMMIT");
                return result;
            } catch (err) {
                if (client) await client.query("ROLLBACK");
                throw err;
            } finally {
                if (client) client.release();
            }
        }
    };
}

module.exports = {
    createAcceptanceSheetService,
    calculatePeriodQty
};

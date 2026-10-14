import { useState } from "react";
import { calendarValue } from "./scheduleViewModel";

function valueOrEmpty(value) {
    return value === null || value === undefined ? "" : value;
}

function validate(values) {
    const errors = {};
    if (values.actualStart && calendarValue(values.actualStart) === null) errors.actualStart = "Ngày bắt đầu không hợp lệ";
    if (values.actualEnd && calendarValue(values.actualEnd) === null) errors.actualEnd = "Ngày kết thúc không hợp lệ";
    if (values.actualStart && values.actualEnd && values.actualEnd < values.actualStart) errors.actualEnd = "Ngày kết thúc không được sớm hơn ngày bắt đầu";
    if (!/^\d+$/.test(String(values.percentComplete)) || Number(values.percentComplete) < 0 || Number(values.percentComplete) > 100) {
        errors.percentComplete = "Phần trăm phải nằm trong khoảng 0–100";
    }
    return errors;
}

export default function ActualProgressForm({ task, onSubmit, onCancel, loading = false, error = "" }) {
    const [values, setValues] = useState({
        actualStart: valueOrEmpty(task?.actualStart ?? task?.actual_start_date),
        actualEnd: valueOrEmpty(task?.actualEnd ?? task?.actual_end_date),
        percentComplete: valueOrEmpty(task?.percentComplete ?? task?.percent_complete ?? 0)
    });
    const [errors, setErrors] = useState({});

    const change = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
    const submit = async (event) => {
        event.preventDefault();
        const nextErrors = validate(values);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;
        const wasComplete = Number(task?.percentComplete ?? task?.percent_complete) === 100;
        if (wasComplete && Number(values.percentComplete) < 100 && !window.confirm("Công việc đã hoàn thành. Bạn có muốn mở lại công việc không?")) return;
        await onSubmit({
            actualStart: values.actualStart || null,
            actualEnd: values.actualEnd || null,
            percentComplete: Number(values.percentComplete)
        });
    };

    return <form className="actual-progress-form" onSubmit={submit} noValidate aria-busy={loading}>
        <h2>Cập nhật tiến độ thực tế</h2>
        {error && <div role="alert" className="actual-progress-error">{error}</div>}
        <label>Ngày bắt đầu thực tế<input type="date" disabled={loading} value={values.actualStart} onChange={change("actualStart")} aria-invalid={Boolean(errors.actualStart)} /></label>
        {errors.actualStart && <p className="actual-progress-field-error">{errors.actualStart}</p>}
        <label>Ngày kết thúc thực tế<input type="date" disabled={loading} value={values.actualEnd} onChange={change("actualEnd")} aria-invalid={Boolean(errors.actualEnd)} /></label>
        {errors.actualEnd && <p className="actual-progress-field-error">{errors.actualEnd}</p>}
        <label>Phần trăm hoàn thành<input type="number" disabled={loading} min="0" max="100" step="1" value={values.percentComplete} onChange={change("percentComplete")} aria-invalid={Boolean(errors.percentComplete)} /></label>
        {errors.percentComplete && <p className="actual-progress-field-error">{errors.percentComplete}</p>}
        <div className="actual-progress-actions"><button type="button" onClick={onCancel} disabled={loading}>Hủy</button><button type="submit" disabled={loading}>{loading ? "Đang lưu…" : "Lưu thay đổi"}</button></div>
    </form>;
}

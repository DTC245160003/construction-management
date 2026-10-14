import { useState } from "react";
import { Field, FormActions, Modal, Notice } from "./OperationsUI";

export default function RecordEditor({ title, initial, fields = [], submit, onClose, onSaved, children, submitLabel = "Lưu" }) {
  const [values,setValues] = useState(initial);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const change = (name,value) => setValues((current) => ({ ...current,[name]:value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await submit(values); onSaved(result); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title={title} variant={fields.length >= 4 ? "drawer" : "modal"} subtitle={fields.length ? "Cập nhật thông tin và kiểm tra trước khi lưu." : undefined} onClose={onClose} busy={busy}><Notice tone="error">{error}</Notice><form onSubmit={save}>
    {fields.filter((field) => !field.when || field.when(values)).map((field) => <Field key={field.name} label={field.label} hint={field.hint}>
      {field.type === "select" ? <select name={field.name} value={values[field.name] ?? ""} onChange={(event) => change(field.name,event.target.value)} required={field.required !== false}><option value="">{field.placeholder || "Chọn…"}</option>{(typeof field.options === "function" ? field.options(values) : field.options).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
        : field.type === "textarea" ? <textarea name={field.name} value={values[field.name] ?? ""} onChange={(event) => change(field.name,event.target.value)} required={field.required !== false} maxLength={field.maxLength || 5000} />
        : <input name={field.name} type={field.type || "text"} value={values[field.name] ?? ""} onChange={(event) => change(field.name,event.target.value)} required={field.required !== false} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength || 255} readOnly={field.readOnly} />}
    </Field>)}
    {typeof children === "function" ? children(values,change,busy) : children}
    <FormActions busy={busy} onClose={onClose} label={submitLabel} />
  </form></Modal>;
}

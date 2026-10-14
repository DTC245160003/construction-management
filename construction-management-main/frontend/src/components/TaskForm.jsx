import { useState } from "react";
import { Alert, Button, Divider, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import { addDependency, removeDependency } from "../services/taskApi";

const integerRule = (min, message) => ({
    validator: (_, value) => Number.isInteger(value) && value >= min && value <= 2147483647
        ? Promise.resolve() : Promise.reject(new Error(message))
});

export default function TaskForm({ projectId, task, items, tasks, dependencies, onSave, onDependencyAdded, onDependencyRemoved, onClose }) {
    const [form] = Form.useForm();
    const [dependencyForm] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [dependencyBusy, setDependencyBusy] = useState(false);
    const [error, setError] = useState("");
    const parentIds = new Set(items.map((item) => item.parent_id));
    const incoming = dependencies.filter((dependency) => dependency.successor_task_id === task.id);
    const taskNames = new Map(tasks.map((entry) => [entry.id, entry.name]));

    const save = async (values) => {
        if (saving) return;
        setSaving(true);
        setError("");
        try {
            await onSave(task.id, { ...values, name: values.name.trim() });
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Không thể lưu công việc");
        } finally {
            setSaving(false);
        }
    };

    const add = async (values) => {
        if (dependencyBusy) return;
        if (incoming.some((entry) => entry.predecessor_task_id === values.predecessor_task_id)) {
            dependencyForm.setFields([{ name: "predecessor_task_id", errors: ["Cặp công việc trước và sau đã có quan hệ phụ thuộc"] }]);
            return;
        }
        setDependencyBusy(true);
        setError("");
        try {
            onDependencyAdded(await addDependency(projectId, task.id, values));
            dependencyForm.resetFields();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Không thể thêm quan hệ phụ thuộc");
        } finally {
            setDependencyBusy(false);
        }
    };

    const remove = async (dependencyId) => {
        setDependencyBusy(true);
        setError("");
        try {
            await removeDependency(projectId, task.id, dependencyId);
            onDependencyRemoved(dependencyId);
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Không thể xóa quan hệ phụ thuộc");
        } finally {
            setDependencyBusy(false);
        }
    };

    return (
        <Modal open title={task.id ? "Sửa công việc" : "Thêm công việc"} footer={null}
            className="task-form-modal" style={{ top: 24 }}
            styles={{ body: { maxHeight: "calc(100dvh - 128px)", overflowY: "auto", paddingRight: 8 } }}
            onCancel={onClose} width={720} mask={{ closable: !saving && !dependencyBusy }}>
            {error && <Alert type="error" title={error} showIcon className="task-form-error" />}
            <Form form={form} layout="vertical" initialValues={{ duration_days: 1, ...task }} onFinish={save}>
                <Form.Item name="name" label="Tên công việc" rules={[
                    { required: true, whitespace: true, message: "Nhập tên công việc" },
                    { max: 255, message: "Tên công việc không được quá 255 ký tự" }
                ]}>
                    <Input autoFocus />
                </Form.Item>
                <Form.Item name="work_item_id" label="Hạng mục lá"
                    rules={[{ required: true, message: "Chọn hạng mục lá" }]}>
                    <Select showSearch={{ optionFilterProp: "label" }} options={items
                        .filter((item) => !parentIds.has(item.id))
                        .map((item) => ({ value: item.id, label: item.title }))} />
                </Form.Item>
                <Form.Item name="duration_days" label="Thời lượng (ngày)" validateTrigger="onChange"
                    rules={[integerRule(1, "Thời lượng phải là số nguyên ngày lớn hơn 0")]}>
                    <InputNumber step={1} changeOnBlur={false} className="task-number-input" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={saving}>Lưu công việc</Button>
            </Form>
            <Divider>Quan hệ phụ thuộc</Divider>
            {!task.id ? <p>Lưu công việc để thêm quan hệ phụ thuộc.</p> : <>
                {incoming.length === 0 && <p>Chưa có quan hệ phụ thuộc.</p>}
                <ul className="task-dependencies" aria-label="Quan hệ hiện tại">
                    {incoming.map((dependency) => <li key={dependency.id}>
                        <span>{taskNames.get(dependency.predecessor_task_id)} — {dependency.dependency_type}
                            {" · "}Độ trễ: {dependency.lag_days} ngày</span>
                        <Button size="small" danger disabled={dependencyBusy} onClick={() => remove(dependency.id)}>Xóa quan hệ</Button>
                    </li>)}
                </ul>
                <Form form={dependencyForm} layout="vertical" onFinish={add}
                    initialValues={{ dependency_type: "FS", lag_days: 0 }}>
                    <Form.Item name="predecessor_task_id" label="Công việc trước"
                        rules={[{ required: true, message: "Chọn công việc trước" }]}>
                        <Select showSearch={{ optionFilterProp: "label" }} placeholder="Gõ tên để tìm công việc"
                            options={tasks.filter((entry) => entry.id !== task.id)
                                .map((entry) => ({ value: entry.id, label: entry.name }))} />
                    </Form.Item>
                    <Space align="start" wrap>
                        <Form.Item name="dependency_type" label="Loại quan hệ" rules={[{ required: true }]}>
                            <Select className="task-type-select" options={["FS", "SS", "FF", "SF"].map((value) => ({ value, label: value }))} />
                        </Form.Item>
                        <Form.Item name="lag_days" label="Độ trễ (ngày, có thể âm)"
                            rules={[integerRule(-2147483648, "Độ trễ phải là số nguyên ngày (có thể âm)")]}>
                            <InputNumber step={1} className="task-number-input" />
                        </Form.Item>
                    </Space>
                    <div><Button htmlType="submit" loading={dependencyBusy} disabled={dependencyBusy}>Thêm quan hệ</Button></div>
                </Form>
            </>}
        </Modal>
    );
}

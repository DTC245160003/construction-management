import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, message } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import WorkItemTree from "../components/WorkItemTree";
import TaskForm from "../components/TaskForm";
import { listTasks, listDependencies, saveTask } from "../services/taskApi";
import { createWorkItem, deleteWorkItem, listWorkItems, updateWorkItem } from "../services/workItemApi";
import { listWorkItemMilestones, createWorkItemMilestone, deleteWorkItemMilestone } from "../services/scheduleApi";
import { numberLabel } from "../services/operationsApi";
import { moneyLabel } from "../services/siteApi";
import "../styles/WorkItemTreePage.css";
import DashboardLayout from "../components/DashboardLayout";
import { Empty, NoProject, Modal } from "../components/OperationsUI";
import { Skeleton, SectionHeading, StatusDistribution } from "../components/OperationsVisuals";
import Icon from "../components/OperationsIcon";
import useRemote from "../hooks/useRemote";
import { validProjectId } from "../services/navigation";

function ProjectWorkItems({ projectId }) {
    const permissions=useRemote(`/projects/${projectId}/overview`);
    const projectRole=permissions.data?.project?.member_role;
    const canEdit=["admin","manager","project_manager","engineer","member"].includes(projectRole);
    const canMilestone=["admin","manager","project_manager","viewer"].includes(projectRole);
    const [items, setItems] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [dependencies, setDependencies] = useState([]);
    const [milestones, setMilestones] = useState([]);
    const [taskEditor, setTaskEditor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [parentId, setParentId] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [form] = Form.useForm();
    const [milestoneForm] = Form.useForm();
    const [milestoneLoading, setMilestoneLoading] = useState(false);

    useEffect(() => {
        let active = true;
        Promise.all([
            listWorkItems(projectId),
            listTasks(projectId),
            listDependencies(projectId),
            listWorkItemMilestones(projectId).catch(() => [])
        ])
            .then(([nextItems, nextTasks, nextDependencies, nextMilestones]) => {
                if (active) {
                    setItems(nextItems);
                    setTasks(nextTasks);
                    setDependencies(nextDependencies);
                    setMilestones(nextMilestones);
                    setTaskEditor(null);
                    setError("");
                }
            })
            .catch((requestError) => {
                if (active) {
                    setError(requestError.response?.data?.message || "Không thể tải cây hạng mục");
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [projectId]);

    const handleSaveMilestone = async (values) => {
        try {
            setMilestoneLoading(true);
            await createWorkItemMilestone(projectId, {
                work_item_id: selectedId,
                name: values.name,
                target_date: values.target_date
            });
            message.success("Đã đặt mốc bàn giao bắt buộc cho hạng mục");
            milestoneForm.resetFields();
            setMilestones(await listWorkItemMilestones(projectId));
        } catch (err) {
            message.error(err.response?.data?.message || "Không thể lưu mốc bàn giao");
        } finally {
            setMilestoneLoading(false);
        }
    };

    const handleDeleteMilestone = async (milestoneId) => {
        try {
            await deleteWorkItemMilestone(projectId, milestoneId);
            message.success("Đã xóa mốc bàn giao");
            setMilestones(await listWorkItemMilestones(projectId));
        } catch (err) {
            message.error(err.response?.data?.message || "Không thể xóa mốc");
        }
    };

    const save = async (itemId, values) => {
        try {
            if (itemId) await updateWorkItem(projectId, itemId, values);
            else await createWorkItem(projectId, { ...values, parentId });
            setParentId(null);
            form.resetFields();
            setItems(await listWorkItems(projectId));
        } catch (requestError) {
            message.error(requestError.response?.data?.message || "Không thể lưu hạng mục");
        }
    };

    const remove = async (item) => {
        try {
            await deleteWorkItem(projectId, item.id);
            setItems(await listWorkItems(projectId));
        } catch (requestError) {
            message.error(requestError.response?.data?.message || "Không thể xóa hạng mục");
        }
    };

    const persistTask = async (taskId, values) => {
        const saved = await saveTask(projectId, taskId, values);
        setTasks((current) => taskId
            ? current.map((entry) => entry.id === saved.id ? saved : entry)
            : [...current, saved]);
        setTaskEditor(saved);
        message.success("Đã lưu công việc");
    };

    const selected = items.find((item) => item.id === selectedId);
    const selectedTasks = tasks.filter((task) => task.work_item_id === selectedId);
    return (
        <div className="work-items-page">
            <div className="wbs-overview"><section className="ops-card wbs-project-summary"><SectionHeading icon="building" title="Cấu trúc phân rã công việc" description={`Dự án #${projectId} · Hạng mục → Hạng mục con → Công việc`} /><div className="wbs-summary-counts"><div><strong>{loading ? "—" : items.length}</strong><span>Hạng mục</span></div><div><strong>{loading ? "—" : tasks.length}</strong><span>Công việc</span></div><div><strong>{loading ? "—" : dependencies.length}</strong><span>Quan hệ phụ thuộc</span></div></div><Link className="wbs-schedule-link" to={`/schedule?projectId=${projectId}`}>Xem tiến độ công việc <Icon name="arrow" size={16} /></Link></section><section className="ops-card"><StatusDistribution title="Trạng thái hạng mục" entries={[["todo","Chưa thực hiện","#a6b4c8"],["doing","Đang thực hiện","#1677ff"],["done","Hoàn thành","#17b26a"]].map(([status,label,color])=>({label,color,value:items.filter((item)=>item.status===status).length}))} label="Hạng mục" /></section></div>
            <section className="ops-card work-items-panel">
                <SectionHeading icon="tree" title="Cây hạng mục" description="Chọn tên hạng mục để xem chi tiết và các công việc bên trong." action={canEdit && <Button onClick={() => setParentId(null)}><Icon name="plus" size={15} />Thêm hạng mục gốc</Button>} />
                {canEdit && <div className="wbs-create"><span>{parentId !== null ? `Thêm vào: ${items.find((item)=>item.id===parentId)?.title || "Hạng mục con"}` : "Thêm hạng mục gốc"}</span>
                <Form form={form} layout="inline" onFinish={(values) => save(null, values)}>
                    <Form.Item name="title" rules={[{ required: true, message: "Nhập tên hạng mục" }]}>
                        <Input placeholder="Tên hạng mục mới" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">Tạo</Button>
                </Form>
                </div>}
                {error && <Alert type="error" message={error} />}
                {loading ? <Skeleton /> : !items.length ? <Empty icon="tree" title="Bắt đầu từ hạng mục đầu tiên">Tạo hạng mục gốc, sau đó thêm hạng mục con và công việc để xây dựng cấu trúc dự án.</Empty> : <div className="wbs-tree-scroll" role="region" aria-label="Cấu trúc hạng mục" tabIndex={0}><WorkItemTree items={items} tasks={tasks} readOnly={!canEdit}
                    onSelect={setSelectedId} selectedId={selectedId}
                    editingId={editingId} setEditingId={setEditingId}
                    onAddTask={(work_item_id) => setTaskEditor({ work_item_id })} onEditTask={setTaskEditor}
                    onSave={save} onDelete={remove}
                    onAdd={(id) => { setParentId(id); form.getFieldInstance("title")?.focus(); }} /></div>}
                <footer className="wbs-tree-footer"><span><Icon name="folder" size={14} /> Hạng mục</span><span><Icon name="task" size={14} /> Công việc</span><span>{items.length} hạng mục · {tasks.length} công việc</span></footer>
                {selected && (
                    <Modal title={selected.title} subtitle="Chi tiết hạng mục" variant="drawer" onClose={() => setSelectedId(null)}>
                        <dl className="ops-details-list">
                            <dt>Trạng thái</dt>
                            <dd>{{ todo: "Chưa thực hiện", doing: "Đang thực hiện", done: "Hoàn thành" }[selected.status] || selected.status}</dd>
                            <dt>Hạng mục cha</dt>
                            <dd>{items.find((item) => item.id === selected.parent_id)?.title || "Hạng mục gốc"}</dd>
                            <dt>Hạng mục con</dt>
                            <dd>{items.filter((item) => item.parent_id === selected.id).length}</dd>
                            <dt>Công việc trực tiếp</dt>
                            <dd>{selectedTasks.length}</dd>
                        </dl>

                        {/* S-35: Khối lượng, đơn vị tính và đơn giá hợp đồng */}
                        {(() => {
                            const isLeaf = items.filter((item) => item.parent_id === selected.id).length === 0;
                            return (
                                <div className="wbs-contract-detail-card">
                                    <div className="wbs-contract-header">
                                        <div className="wbs-contract-title-wrap">
                                            <Icon name="cube" size={16} />
                                            <h4>Hợp đồng kinh tế (S-35)</h4>
                                        </div>
                                        <span className={`wbs-type-badge ${isLeaf ? "is-leaf" : "is-parent"}`}>
                                            {isLeaf ? "Hạng mục lá" : "Hạng mục cha"}
                                        </span>
                                    </div>
                                    {isLeaf ? (
                                        <>
                                            <dl className="ops-details-list wbs-contract-list">
                                                <dt>Khối lượng HĐ</dt>
                                                <dd>{selected.contract_quantity != null ? `${numberLabel(selected.contract_quantity)} ${selected.unit || ""}` : <span className="text-muted">Chưa khai báo</span>}</dd>
                                                <dt>Đơn vị tính</dt>
                                                <dd>{selected.unit || <span className="text-muted">Chưa khai báo</span>}</dd>
                                                <dt>Đơn giá HĐ</dt>
                                                <dd>{selected.contract_unit_price != null ? `${moneyLabel(selected.contract_unit_price)} ₫` : <span className="text-muted">Chưa khai báo</span>}</dd>
                                                <dt>Giá trị hợp đồng</dt>
                                                <dd className="wbs-highlight-amount">
                                                    {selected.contract_amount != null ? `${moneyLabel(selected.contract_amount)} ₫` : <span className="text-muted">Chưa có</span>}
                                                </dd>
                                            </dl>
                                            {canEdit && (
                                                <div className="wbs-contract-actions">
                                                    <Button size="small" type="primary" ghost onClick={() => {
                                                        setEditingId(selected.id);
                                                        setSelectedId(null);
                                                    }}>
                                                        <Icon name="edit" size={13} style={{ marginRight: 4 }} />
                                                        Chỉnh sửa hợp đồng
                                                    </Button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="wbs-parent-contract-info">
                                            <p className="wbs-parent-notice">
                                                <Icon name="info" size={14} />
                                                Hạng mục cha không được nhập trực tiếp các giá trị hợp đồng. Giá trị hợp đồng được tổng hợp tự động từ các hạng mục lá.
                                            </p>
                                            <div className="wbs-parent-total-box">
                                                <span>Tổng giá trị hợp đồng:</span>
                                                <strong>{selected.contract_amount != null ? `${moneyLabel(selected.contract_amount)} ₫` : "0 ₫"}</strong>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* T-43: Mốc bàn giao bắt buộc của hạng mục */}
                        <div style={{ margin: "20px 0", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            <h4 style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>
                                Mốc bàn giao bắt buộc (Milestone)
                            </h4>
                            {(() => {
                                const m = milestones.find((entry) => entry.work_item_id === selected.id);
                                if (m) {
                                    return (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div>
                                                <strong>{m.name}</strong>
                                                <div style={{ fontSize: "12px", color: "#64748b" }}>
                                                    Hạn hoàn thành: <b>{m.target_date}</b>
                                                </div>
                                            </div>
                                            {canMilestone && <Button size="small" danger onClick={() => handleDeleteMilestone(m.id)}>
                                                Xóa mốc
                                            </Button>}
                                        </div>
                                    );
                                }
                                return canMilestone ? (
                                    <Form form={milestoneForm} layout="vertical" onFinish={handleSaveMilestone}>
                                        <Form.Item name="name" label="Tên mốc bàn giao" rules={[{ required: true, message: "Nhập tên mốc" }]}>
                                            <Input placeholder="Ví dụ: Bàn giao phần thô, Nghiệm thu móng..." />
                                        </Form.Item>
                                        <Form.Item name="target_date" label="Ngày bắt buộc (Hạn cam kết)" rules={[{ required: true, message: "Chọn ngày" }]}>
                                            <Input type="date" />
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" loading={milestoneLoading}>
                                            Đặt mốc bàn giao
                                        </Button>
                                    </Form>
                                ) : <p>Chưa có mốc bàn giao.</p>;
                            })()}
                        </div>

                        <h3>Công việc trong hạng mục</h3>
                        {selectedTasks.length ? (
                            <div className="wbs-detail-tasks">
                                {selectedTasks.map((task) => (
                                    <button key={task.id} disabled={!canEdit} onClick={() => { setSelectedId(null); setTaskEditor(task); }}>
                                        <Icon name="task" />
                                        <span>
                                            <strong>{task.name}</strong>
                                            <small>
                                                {task.duration_days} ngày
                                                {task.planned_quantity != null ? ` · ${Number(task.planned_quantity).toLocaleString("vi-VN")} ${task.quantity_unit || ""}` : ""}
                                            </small>
                                        </span>
                                        <Icon name="right" size={16} />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <Empty icon="task">Chưa có công việc trực tiếp trong hạng mục này.</Empty>
                        )}
                    </Modal>
                )}
                {canEdit && taskEditor && <TaskForm key={`${projectId}-${taskEditor.id || "new"}`} projectId={projectId}
                    task={taskEditor} items={items} tasks={tasks} dependencies={dependencies}
                    onSave={persistTask} onClose={() => setTaskEditor(null)}
                    onDependencyAdded={(dependency) => setDependencies((current) => [...current, dependency])}
                    onDependencyRemoved={(id) => setDependencies((current) => current.filter((entry) => entry.id !== id))} />}
            </section>
        </div>
    );
}

export default function WorkItemTreePage() {
    const [params] = useSearchParams();
    const projectId = params.get("projectId");
    return <DashboardLayout title="Cây hạng mục" description="Quản lý hạng mục, công việc và quan hệ phụ thuộc.">{validProjectId(projectId) ? <ProjectWorkItems key={projectId} projectId={Number(projectId)} /> : <NoProject />}</DashboardLayout>;
}

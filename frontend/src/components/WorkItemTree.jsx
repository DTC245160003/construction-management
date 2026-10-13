import { useState } from "react";
import { Button, Input, Select, Space } from "antd";
import Icon from "./OperationsIcon";

const statusLabels = { todo: "Chưa thực hiện", doing: "Đang thực hiện", done: "Hoàn thành" };

function childrenOf(items, parentId) {
    return items.filter((item) => (item.parent_id ?? null) === parentId);
}

function WorkItemEditor({ item, onSave, onCancel }) {
    const [title, setTitle] = useState(item?.title || "");
    const [status, setStatus] = useState(item?.status || "todo");

    return (
        <Space.Compact className="work-item-editor">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
            <Select value={status} onChange={setStatus} options={[
                { value: "todo", label: "Chưa thực hiện" },
                { value: "doing", label: "Đang thực hiện" },
                { value: "done", label: "Hoàn thành" }
            ]} />
            <Button type="primary" onClick={() => onSave({ title, status })}>Lưu</Button>
            <Button onClick={onCancel}>Hủy</Button>
        </Space.Compact>
    );
}

function WorkItemNode({ readOnly,item, items, tasks, onAddTask, onEditTask, depth, expanded, editingId, onToggle, onEdit, onSave, onCancel, onDelete, onAdd, onSelect, selectedId }) {
    const children = childrenOf(items, item.id);
    const itemTasks = tasks.filter((task) => task.work_item_id === item.id);
    const isExpanded = expanded.has(item.id);
    return (
        <div className="work-item-node" style={{ "--depth": depth }}>
            <div className={`work-item-row ${selectedId === item.id ? "is-selected" : ""}`}>
                <button className={`tree-toggle ${isExpanded ? "is-expanded" : ""}`} disabled={!children.length && !itemTasks.length} onClick={() => onToggle(item.id)} aria-label="Mở rộng" aria-expanded={isExpanded}>
                    {(children.length > 0 || itemTasks.length > 0) && <Icon name="right" size={14} />}
                </button>
                {editingId === item.id ? (
                    <WorkItemEditor item={item} onSave={(values) => onSave(item.id, values)} onCancel={onCancel} />
                ) : (
                    <>
                        <span className={`wbs-node-icon ${children.length ? "is-parent" : ""}`}><Icon name={children.length ? "folder" : "cube"} size={19} /></span>
                        <button type="button" className="work-item-title" onClick={() => onSelect?.(item.id)}><span>{item.title}</span><small>{children.length ? `${children.length} hạng mục con` : `${itemTasks.length} công việc`}</small></button>
                        <span className={`work-item-status status-${item.status}`}>{statusLabels[item.status] || item.status}</span>
                        {!readOnly && <div className="wbs-row-actions">
                        <Button size="small" disabled={itemTasks.length > 0} onClick={() => onAdd(item.id)}>Thêm con</Button>
                        {children.length === 0 && <Button size="small" onClick={() => onAddTask(item.id)}>Thêm công việc</Button>}
                        <Button size="small" aria-label="Sửa" title="Sửa hạng mục" onClick={() => onEdit(item.id)}><Icon name="edit" size={14} /></Button>
                        <Button size="small" danger aria-label="Xóa" title="Xóa hạng mục" onClick={() => onDelete(item)}><Icon name="trash" size={14} /></Button>
                        </div>}
                    </>
                )}
            </div>
            {isExpanded && itemTasks.map((task) => <div className="task-tree-row" key={task.id}>
                <Icon name="task" size={16} /><span className="wbs-task-name">{task.name}{task.isCritical && <small className="wbs-critical">Công việc găng</small>}</span><span className="wbs-duration"><Icon name="clock" size={13} />{task.duration_days} ngày</span>
                {task.planned_quantity != null && <span className="wbs-task-quantity">{Number(task.planned_quantity).toLocaleString("vi-VN")} {task.quantity_unit}</span>}
                {!readOnly && <Button size="small" aria-label="Sửa công việc" title="Sửa công việc" onClick={() => onEditTask(task)}><Icon name="edit" size={14} /></Button>}
            </div>)}
            {isExpanded && children.map((child) => (
                <WorkItemNode readOnly={readOnly} key={child.id} item={child} items={items} depth={depth + 1}
                    onSelect={onSelect} selectedId={selectedId}
                    tasks={tasks} onAddTask={onAddTask} onEditTask={onEditTask}
                    expanded={expanded} editingId={editingId} onToggle={onToggle} onEdit={onEdit}
                    onSave={onSave} onCancel={onCancel} onDelete={onDelete} onAdd={onAdd} />
            ))}
        </div>
    );
}

export default function WorkItemTree({ readOnly=false,items, tasks = [], onAddTask, onEditTask, onSave, onDelete, onAdd, onSelect, selectedId }) {
    const initialExpanded = new Set(items.filter((item) => (item.depth ?? 0) < 2).map((item) => item.id));
    const [expanded, setExpanded] = useState(initialExpanded);
    const [editingId, setEditingId] = useState(null);

    const toggle = (id) => setExpanded((current) => {
        const next = new Set(current);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    return (
        <div className="work-item-tree">
            {items.filter((item) => item.parent_id == null).map((item) => (
                <WorkItemNode readOnly={readOnly} key={item.id} item={item} items={items} depth={0}
                    onSelect={onSelect} selectedId={selectedId}
                    tasks={tasks} onAddTask={onAddTask} onEditTask={onEditTask}
                    expanded={expanded} editingId={editingId} onToggle={toggle}
                    onEdit={setEditingId} onSave={(id, values) => { setEditingId(null); onSave(id, values); }}
                    onCancel={() => setEditingId(null)} onDelete={onDelete} onAdd={onAdd} />
            ))}
        </div>
    );
}

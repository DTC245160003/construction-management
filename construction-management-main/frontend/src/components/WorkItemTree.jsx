import { useState } from "react";
import { Button, Input, Select } from "antd";
import Icon from "./OperationsIcon";
import { numberLabel } from "../services/operationsApi";
import { moneyLabel } from "../services/siteApi";

const statusLabels = { todo: "Chưa thực hiện", doing: "Đang thực hiện", done: "Hoàn thành" };

function childrenOf(items, parentId) {
    return items.filter((item) => (item.parent_id ?? null) === parentId);
}

function WorkItemEditor({ item, isLeaf, onSave, onCancel }) {
    const [title, setTitle] = useState(item?.title || "");
    const [status, setStatus] = useState(item?.status || "todo");
    const [quantity, setQuantity] = useState(item?.contract_quantity ?? "");
    const [unit, setUnit] = useState(item?.unit ?? "");
    const [unitPrice, setUnitPrice] = useState(item?.contract_unit_price ?? "");

    // Calculate live preview of contract amount using Decimal math
    const previewAmount = (() => {
        if (!quantity || !unitPrice) return null;
        try {
            const [qw, qf = ""] = String(quantity).split(".");
            const [pw, pf = ""] = String(unitPrice).split(".");
            const q = BigInt(qw || "0") * 10000n + BigInt(qf.padEnd(4, "0").slice(0, 4));
            const p = BigInt(pw || "0") * 100n + BigInt(pf.padEnd(2, "0").slice(0, 2));
            const prod = q * p;
            const rounded = (prod + 5000n) / 10000n;
            const digits = rounded.toString().padStart(3, "0");
            return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
        } catch {
            return null;
        }
    })();

    const handleSave = () => {
        const payload = {
            title,
            status,
            ...(isLeaf ? {
                contract_quantity: quantity ? String(quantity).trim() : null,
                unit: unit ? String(unit).trim() : null,
                contract_unit_price: unitPrice ? String(unitPrice).trim() : null,
            } : {})
        };
        onSave(payload);
    };

    return (
        <div className="work-item-editor-box">
            <div className="wbs-editor-main">
                <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Tên hạng mục"
                    autoFocus
                    style={{ minWidth: 200, flex: 1 }}
                />
                <Select
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: "todo", label: "Chưa thực hiện" },
                        { value: "doing", label: "Đang thực hiện" },
                        { value: "done", label: "Hoàn thành" }
                    ]}
                    style={{ width: 140 }}
                />
            </div>
            {isLeaf ? (
                <div className="wbs-editor-contract">
                    <span className="wbs-editor-label">Hợp đồng (S-35):</span>
                    <Input
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        placeholder="Khối lượng HĐ"
                        style={{ width: 130 }}
                        type="number"
                        step="0.0001"
                        min="0"
                    />
                    <Input
                        value={unit}
                        onChange={(event) => setUnit(event.target.value)}
                        placeholder="Đơn vị tính (m³, m²...)"
                        style={{ width: 140 }}
                        maxLength={50}
                    />
                    <Input
                        value={unitPrice}
                        onChange={(event) => setUnitPrice(event.target.value)}
                        placeholder="Đơn giá (₫)"
                        style={{ width: 140 }}
                        type="number"
                        step="0.01"
                        min="0"
                    />
                    {previewAmount && (
                        <span className="wbs-editor-preview">
                            = <strong>{moneyLabel(previewAmount)} ₫</strong>
                        </span>
                    )}
                </div>
            ) : (
                <div className="wbs-editor-parent-notice">
                    <small>Hạng mục cha: Giá trị hợp đồng ({item?.contract_amount ? `${moneyLabel(item.contract_amount)} ₫` : "chưa có"}) được tổng hợp tự động từ các hạng mục con.</small>
                </div>
            )}
            <div className="wbs-editor-actions">
                <Button type="primary" size="small" onClick={handleSave}>Lưu</Button>
                <Button size="small" onClick={onCancel}>Hủy</Button>
            </div>
        </div>
    );
}

function WorkItemNode({ readOnly, item, items, tasks, onAddTask, onEditTask, depth, expanded, editingId, onToggle, onEdit, onSave, onCancel, onDelete, onAdd, onSelect, selectedId }) {
    const children = childrenOf(items, item.id);
    const itemTasks = tasks.filter((task) => task.work_item_id === item.id);
    const isExpanded = expanded.has(item.id);
    const isLeaf = children.length === 0;

    return (
        <div className="work-item-node" style={{ "--depth": depth }}>
            <div className={`work-item-row ${selectedId === item.id ? "is-selected" : ""}`}>
                <button
                    className={`tree-toggle ${isExpanded ? "is-expanded" : ""}`}
                    disabled={!children.length && !itemTasks.length}
                    onClick={() => onToggle(item.id)}
                    aria-label="Mở rộng"
                    aria-expanded={isExpanded}
                >
                    {(children.length > 0 || itemTasks.length > 0) && <Icon name="right" size={14} />}
                </button>
                {editingId === item.id ? (
                    <WorkItemEditor item={item} isLeaf={isLeaf} onSave={(values) => onSave(item.id, values)} onCancel={onCancel} />
                ) : (
                    <>
                        <span className={`wbs-node-icon ${children.length ? "is-parent" : ""}`}>
                            <Icon name={children.length ? "folder" : "cube"} size={19} />
                        </span>
                        <button type="button" className="work-item-title" onClick={() => onSelect?.(item.id)}>
                            <span>{item.title}</span>
                            <small>{children.length ? `${children.length} hạng mục con` : `${itemTasks.length} công việc`}</small>
                        </button>

                        {/* S-35: Hiển thị giá trị hợp đồng */}
                        {isLeaf ? (
                            item.contract_quantity != null && item.contract_amount != null ? (
                                <span className="wbs-contract-tag is-leaf" title="Khối lượng × Đơn giá = Giá trị HĐ">
                                    <span className="wbs-qty-unit">{numberLabel(item.contract_quantity)} {item.unit || ""}</span>
                                    <span className="wbs-multiply">×</span>
                                    <span className="wbs-price">{moneyLabel(item.contract_unit_price)} ₫</span>
                                    <span className="wbs-equal">=</span>
                                    <strong className="wbs-amount">{moneyLabel(item.contract_amount)} ₫</strong>
                                </span>
                            ) : (
                                <span className="wbs-contract-tag is-empty" title="Chưa khai báo hợp đồng">Chưa có HĐ</span>
                            )
                        ) : (
                            item.contract_amount != null ? (
                                <span className="wbs-contract-tag is-parent" title="Tổng giá trị hợp đồng được tổng hợp từ các hạng mục lá">
                                    Tổng HĐ: <strong className="wbs-amount">{moneyLabel(item.contract_amount)} ₫</strong>
                                </span>
                            ) : null
                        )}

                        <span className={`work-item-status status-${item.status}`}>{statusLabels[item.status] || item.status}</span>
                        {!readOnly && (
                            <div className="wbs-row-actions">
                                <Button size="small" disabled={itemTasks.length > 0} onClick={() => onAdd(item.id)}>Thêm con</Button>
                                {children.length === 0 && <Button size="small" onClick={() => onAddTask(item.id)}>Thêm công việc</Button>}
                                <Button size="small" aria-label="Sửa" title="Sửa hạng mục và hợp đồng" onClick={() => onEdit(item.id)}>
                                    <Icon name="edit" size={14} />
                                </Button>
                                <Button size="small" danger aria-label="Xóa" title="Xóa hạng mục" onClick={() => onDelete(item)}>
                                    <Icon name="trash" size={14} />
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
            {isExpanded && itemTasks.map((task) => (
                <div className="task-tree-row" key={task.id}>
                    <Icon name="task" size={16} />
                    <span className="wbs-task-name">{task.name}{task.isCritical && <small className="wbs-critical">Công việc găng</small>}</span>
                    <span className="wbs-duration"><Icon name="clock" size={13} />{task.duration_days} ngày</span>
                    {task.planned_quantity != null && (
                        <span className="wbs-task-quantity">{Number(task.planned_quantity).toLocaleString("vi-VN")} {task.quantity_unit}</span>
                    )}
                    {!readOnly && (
                        <Button size="small" aria-label="Sửa công việc" title="Sửa công việc" onClick={() => onEditTask(task)}>
                            <Icon name="edit" size={14} />
                        </Button>
                    )}
                </div>
            ))}
            {isExpanded && children.map((child) => (
                <WorkItemNode
                    readOnly={readOnly}
                    key={child.id}
                    item={child}
                    items={items}
                    depth={depth + 1}
                    onSelect={onSelect}
                    selectedId={selectedId}
                    tasks={tasks}
                    onAddTask={onAddTask}
                    onEditTask={onEditTask}
                    expanded={expanded}
                    editingId={editingId}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onSave={onSave}
                    onCancel={onCancel}
                    onDelete={onDelete}
                    onAdd={onAdd}
                />
            ))}
        </div>
    );
}

export default function WorkItemTree({ readOnly = false, items, tasks = [], onAddTask, onEditTask, onSave, onDelete, onAdd, onSelect, selectedId, editingId, setEditingId }) {
    const initialExpanded = new Set(items.filter((item) => (item.depth ?? 0) < 2).map((item) => item.id));
    const [expanded, setExpanded] = useState(initialExpanded);
    const [localEditingId, setLocalEditingId] = useState(null);

    const activeEditingId = editingId !== undefined ? editingId : localEditingId;
    const handleSetEditingId = setEditingId || setLocalEditingId;

    const toggle = (id) => setExpanded((current) => {
        const next = new Set(current);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    return (
        <div className="work-item-tree">
            {items.filter((item) => item.parent_id == null).map((item) => (
                <WorkItemNode
                    readOnly={readOnly}
                    key={item.id}
                    item={item}
                    items={items}
                    depth={0}
                    onSelect={onSelect}
                    selectedId={selectedId}
                    tasks={tasks}
                    onAddTask={onAddTask}
                    onEditTask={onEditTask}
                    expanded={expanded}
                    editingId={activeEditingId}
                    onToggle={toggle}
                    onEdit={handleSetEditingId}
                    onSave={(id, values) => { handleSetEditingId(null); onSave(id, values); }}
                    onCancel={() => handleSetEditingId(null)}
                    onDelete={onDelete}
                    onAdd={onAdd}
                />
            ))}
        </div>
    );
}

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Empty, Spin, Table, Tag } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { getSchedule, saveBaseline, listMilestoneAlerts } from "../services/scheduleApi";
import useRemote from "../hooks/useRemote";
import DashboardLayout from "../components/DashboardLayout";
import Icon from "../components/OperationsIcon";
import { SectionHeading } from "../components/OperationsVisuals";
import ScheduleTimeline from "../features/gantt/ScheduleTimeline";
import "../styles/Schedule.css";

const day = (value) => `Ngày ${value.toLocaleString("vi-VN")}`;
const columns = [
    { title: "Tên công việc", dataIndex: "name", key: "name" },
    { title: "Thời lượng", dataIndex: "duration_days", key: "duration", render: (value) => `${value.toLocaleString("vi-VN")} ngày` },
    { title: "Khởi sớm (ES)", dataIndex: "es", key: "es", render: day },
    { title: "Kết sớm (EF)", dataIndex: "ef", key: "ef", render: day },
    { title: "Khởi muộn (LS)", dataIndex: "ls", key: "ls", render: day },
    { title: "Kết muộn (LF)", dataIndex: "lf", key: "lf", render: day },
    { title: "Độ trễ", dataIndex: "slack", key: "slack", render: (value) => `${value.toLocaleString("vi-VN")} ngày` },
    { title: "Trạng thái", dataIndex: "isCritical", key: "critical", render: (value, task) =>
        <Tag color={task.newlyCritical ? "orange" : value ? "red" : "default"}>{task.newlyCritical ? "Mới thành găng" : value ? "Găng" : "Không găng"}</Tag> }
];

function ProjectSchedule({ projectId }) {
    const permissions=useRemote(`/projects/${projectId}/overview`);
    const canManage=["admin","project_manager","manager"].includes(permissions.data?.project?.member_role);
    const [criticalOnly, setCriticalOnly] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState({ loading: true, schedule: [], error: "" });
    const [savingBaseline, setSavingBaseline] = useState(false);
    const [alerts, setAlerts] = useState([]);
    const [selectedAlert, setSelectedAlert] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        getSchedule(projectId, { criticalOnly, signal: controller.signal }).then(async schedule => [schedule, await listMilestoneAlerts(projectId).catch(() => [])])
            .then(([schedule, alertList]) => {
                if (!controller.signal.aborted) {
                    setState({ loading: false, schedule, error: "" });
                    setAlerts(alertList);
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setState({
                        loading: false,
                        schedule: [],
                        error: error.response?.data?.message || "Không thể tải tiến độ. Vui lòng thử lại."
                    });
                }
            });
        return () => controller.abort();
    }, [projectId, criticalOnly, attempt]);

    const changeFilter = (checked) => {
        setState({ loading: true, schedule: [], error: "" });
        setCriticalOnly(checked);
    };

    const retry = () => {
        setState({ loading: true, schedule: [], error: "" });
        setAttempt((value) => value + 1);
    };

    const handleLockBaseline = async () => {
        try {
            setSavingBaseline(true);
            await saveBaseline(projectId);
            retry();
        } catch (err) {
            alert(err.response?.data?.message || "Không thể chốt kế hoạch gốc");
        } finally {
            setSavingBaseline(false);
        }
    };

    const hasBaseline = state.schedule.some((t) => t.baseline_es != null);

    return (
        <section className="ops-card schedule-panel">
            <SectionHeading
                icon="trend"
                title="Tiến độ công việc"
                description={`Dự án #${projectId} · Kế hoạch theo đường găng CPM`}
                action={canManage &&
                    <Button
                        type="primary"
                        onClick={handleLockBaseline}
                        loading={savingBaseline}
                        disabled={state.loading || state.schedule.length === 0}
                    >
                        Chốt kế hoạch gốc
                    </Button>
                }
            />
            <div className="schedule-heading-links">
                <Link to={`/work-items?projectId=${projectId}`}>Quay lại cây hạng mục</Link>
                <Link to={`/field-assignments?projectId=${projectId}`}>Giao việc hiện trường</Link>
            </div>

            {canManage && !state.loading && state.schedule.length > 0 && !hasBaseline && (
                <div className="baseline-alert-notice">
                    <span>
                        <Icon name="info" size={16} /> <strong>Chưa chốt kế hoạch gốc</strong>: Sơ đồ hiện tại đang chạy theo kế hoạch tính toán động. Bấm &quot;Chốt kế hoạch gốc&quot; để lưu mốc chuẩn làm căn cứ so sánh.
                    </span>
                </div>
            )}

            <p className="schedule-note">
                Các mốc tính bằng ngày kể từ lúc khởi công (Ngày 0). Độ trễ là số ngày có thể trì hoãn; công việc găng có độ trễ bằng 0.
            </p>
            <div className="schedule-toolbar">
                <Checkbox checked={criticalOnly} onChange={(event) => changeFilter(event.target.checked)}>
                    Chỉ hiện công việc găng
                </Checkbox>
                <Button onClick={retry} disabled={state.loading}>Tải lại</Button>
            </div>
            {state.loading ? (
                <div className="schedule-loading" role="status" aria-live="polite">
                    <Spin /><span>Đang tải tiến độ…</span>
                </div>
            ) : state.error ? (
                <Alert type="error" showIcon title={state.error} />
            ) : state.schedule.length === 0 ? (
                <Empty
                    description={
                        criticalOnly
                            ? "Không có công việc găng."
                            : "Dự án chưa có công việc. Thêm công việc từ cây hạng mục để tính tiến độ."
                    }
                />
            ) : (
                <>
                    <div className="schedule-summary">
                        <div>
                            <span>Công việc hiển thị</span>
                            <strong>{state.schedule.length}</strong>
                        </div>
                        <div>
                            <span>Công việc găng</span>
                            <strong className="schedule-critical-number">
                                {state.schedule.filter((task) => task.isCritical).length}
                            </strong>
                        </div>
                        <div>
                            <span>Kết thúc sớm nhất trong kết quả</span>
                            <strong>Ngày {Math.max(...state.schedule.map((task) => task.ef))}</strong>
                        </div>
                    </div>
                    <ScheduleTimeline projectId={projectId} schedule={state.schedule} criticalOnly={criticalOnly} onShowAll={() => changeFilter(false)} onScheduleChanged={async () => {
                        const schedule = await getSchedule(projectId, { criticalOnly });
                        setState({ loading: false, schedule, error: "" });
                        setAlerts(await listMilestoneAlerts(projectId).catch(() => []));
                    }} />

                    {/* T-45: Danh sách cảnh báo mốc kèm chuỗi việc gây chậm */}
                    {alerts.length > 0 && (
                        <div className="alerts-section">
                            <div className="alerts-header">
                                <h3>Cảnh báo mốc bàn giao ({alerts.filter((a) => a.status === "open").length} đang mở)</h3>
                            </div>
                            <Table
                                rowKey="id"
                                pagination={false}
                                dataSource={alerts}
                                scroll={{ x: 780 }}
                                columns={[
                                    {
                                        title: "Mốc / Hạng mục",
                                        render: (_, r) => (
                                            <div>
                                                <strong>{r.milestone_name}</strong>
                                                <div style={{ fontSize: 11, color: "#64748b" }}>{r.work_item_title}</div>
                                            </div>
                                        )
                                    },
                                    {
                                        title: "Hạn cam kết",
                                        dataIndex: "milestone_target_date"
                                    },
                                    {
                                        title: "Số ngày vượt",
                                        dataIndex: "overdue_working_days",
                                        render: (val, r) => (
                                            <span style={{ color: r.status === "open" ? "#ef4444" : "#64748b", fontWeight: 600 }}>
                                                {val > 0 ? `Vượt ${val} ngày làm việc` : "Đúng tiến độ"}
                                            </span>
                                        )
                                    },
                                    {
                                        title: "Trạng thái",
                                        dataIndex: "status",
                                        render: (val) => (
                                            <span className={val === "open" ? "alerts-badge-danger" : "alerts-badge-success"}>
                                                {val === "open" ? "Đang mở" : "Đã khắc phục"}
                                            </span>
                                        )
                                    },
                                    {
                                        title: "Chuỗi việc gây chậm",
                                        render: (_, r) => (
                                            <Button size="small" onClick={() => setSelectedAlert(r)}>
                                                Xem chuỗi việc ({Array.isArray(r.critical_path) ? r.critical_path.length : 0})
                                            </Button>
                                        )
                                    }
                                ]}
                            />
                        </div>
                    )}

                    <div className="schedule-cpm-heading">
                        <h2>Chi tiết tính toán CPM</h2>
                        <span>ES / EF · LS / LF · Độ dự trữ</span>
                    </div>
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={state.schedule}
                        pagination={false}
                        scroll={{ x: 1000 }}
                        rowClassName={(task) => (task.isCritical ? "schedule-critical-row" : "")}
                    />
                </>
            )}

            {selectedAlert && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
                    justifyContent: "center", zIndex: 1000
                }}>
                    <div style={{
                        background: "#fff", padding: 24, borderRadius: 8, maxWidth: 550, width: "90%",
                        maxHeight: "80vh", overflowY: "auto"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3>Chuỗi công việc gây chậm: {selectedAlert.milestone_name}</h3>
                            <Button size="small" onClick={() => setSelectedAlert(null)}>Đóng</Button>
                        </div>
                        <p style={{ color: "#475569", fontSize: 13, marginBottom: 12 }}>
                            Trình tự các công việc trên đường găng dẫn từ đầu đến công việc cuối của hạng mục (theo tên công việc):
                        </p>
                        <div className="critical-chain-tags">
                            {Array.isArray(selectedAlert.critical_path) && selectedAlert.critical_path.length > 0 ? (
                                selectedAlert.critical_path.map((name, index) => (
                                    <span key={index} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span className="critical-chain-step">{name}</span>
                                        {index < selectedAlert.critical_path.length - 1 && (
                                            <span className="critical-chain-arrow">→</span>
                                        )}
                                    </span>
                                ))
                            ) : (
                                <span style={{ color: "#94a3b8" }}>Không có chuỗi phụ thuộc</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

export default function Schedule() {
    const [params] = useSearchParams();
    const projectId = Number(params.get("projectId"));
    const validProject = Number.isInteger(projectId) && projectId > 0 && projectId <= 2147483647;
    return (
        <DashboardLayout
            title="Tiến độ & đường găng"
            description="Theo dõi trình tự thi công, thời lượng và các công việc quyết định tiến độ."
        >
            <div className="schedule-page">
                {validProject ? (
                    <ProjectSchedule key={projectId} projectId={projectId} />
                ) : (
                    <Alert type="error" showIcon title="Vui lòng chọn dự án hợp lệ từ cây hạng mục để xem tiến độ." />
                )}
            </div>
        </DashboardLayout>
    );
}

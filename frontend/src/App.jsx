import {
    BrowserRouter,
    Routes,
    Route,
    Navigate
} from "react-router-dom";
import { lazy, Suspense } from "react";

import Login from "./pages/Login";
import Register from "./pages/Register";
import AcceptInvitation from "./pages/AcceptInvitation";
import Home from "./pages/Home";
const WorkItems = lazy(() => import("./pages/WorkItemTreePage"));
const Schedule = lazy(() => import("./pages/Schedule"));
import Members from "./pages/Members";
import Projects from "./pages/Projects";
import Calendar from "./pages/Calendar";
const FieldAssignments = lazy(() => import("./pages/FieldAssignments"));
import ProjectActivity from "./pages/ProjectActivity";
import PendingModule from "./pages/PendingModule";
import SiteJournal from "./pages/SiteJournal";
import Acceptance from "./pages/Acceptance";
import Payments from "./pages/Payments";
import CostsMaterials from "./pages/CostsMaterials";
import SitePhotos from "./pages/SitePhotos";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import SystemAdmin from "./pages/SystemAdmin";


function App() {


    return (

        <BrowserRouter>
            <Suspense fallback={<div className="route-loading" role="status">Đang tải trang…</div>}>
                <Routes>

                <Route 
                    path="/login"
                    element={<Login />}
                />


                <Route
                    path="/register"
                    element={<Register />}
                />


                <Route
                    path="/home"
                    element={<Home />}
                />

                <Route
                    path="/work-items"
                    element={<WorkItems />}
                />

                <Route path="/schedule" element={<Schedule />} />
                <Route path="/accept-invitation" element={<AcceptInvitation />} />
                <Route path="/members" element={<Members />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/field-assignments" element={<FieldAssignments />} />
                {["notifications", "audit-logs"].map((type) => <Route key={type} path={`/${type}`} element={<ProjectActivity key={type} type={type} />} />)}
                <Route path="/site-journal" element={<SiteJournal />} />
                <Route path="/acceptance" element={<Acceptance />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/costs-materials" element={<CostsMaterials />} />
                <Route path="/site-photos" element={<SitePhotos />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/system-admin" element={<SystemAdmin />} />
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="*" element={<PendingModule />} />


                </Routes>
            </Suspense>
        </BrowserRouter>

    );

}


export default App;

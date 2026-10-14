import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Gantt from "../../src/features/gantt/Gantt";

const root = createRoot(document.getElementById("root"));
const props = await (await fetch("/__t31/data")).json();
window.t31Render = (next) => root.render(createElement(Gantt, {
    ...next, onBarSelect: (bar) => { window.t31Selected = bar; }
}));
window.t31Render(props);

import { useEffect, useRef, useState } from "react";

const OVERSCAN = 8;
const WINDOW_THRESHOLD = 100;

// Render all small schedules. Large schedules keep a few extra rows above/below
// the viewport; the full logical height and original row indexes stay unchanged.
export default function useGanttViewport(rowCount, rowHeight, headerHeight) {
    const containerRef = useRef(null);
    const frameRef = useRef(null);
    const [viewport, setViewport] = useState({ top: 0, height: 600 });
    const [printing, setPrinting] = useState(false);
    useEffect(() => {
        const media = window.matchMedia("print");
        const update = () => setPrinting(media.matches);
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        const container = containerRef.current;
        if (!container || rowCount <= WINDOW_THRESHOLD) return undefined;
        const measure = () => {
            if (frameRef.current !== null) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                // Don't reconcile a new window for every pixel. Four-row blocks
                // fit inside the overscan and keep ordinary scrolling on the compositor.
                const top = Math.floor(container.scrollTop / (rowHeight * 4)) * rowHeight * 4;
                const height = container.clientHeight;
                setViewport((current) => current.top === top && current.height === height ? current : { top, height });
            });
        };
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        container.addEventListener("scroll", measure, { passive: true });
        measure();
        return () => {
            observer.disconnect();
            container.removeEventListener("scroll", measure);
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
    }, [rowCount, rowHeight]);

    const windowed = rowCount > WINDOW_THRESHOLD && !printing;
    const count = Math.ceil(viewport.height / rowHeight) + OVERSCAN * 2 + 1;
    const first = windowed ? Math.min(Math.max(0, rowCount - count), Math.max(0, Math.floor((viewport.top - headerHeight) / rowHeight) - OVERSCAN)) : 0;
    const end = windowed ? Math.min(rowCount, first + count) : rowCount;
    return { containerRef, first, end, windowed };
}

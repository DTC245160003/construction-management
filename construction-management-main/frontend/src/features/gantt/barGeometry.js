// T-30 owns the time-to-pixel conversion. This adapter only clips the resulting
// coordinates; missing/reversed/outside ranges never become fake Day-0 bars.
export function barGeometry(bar, scale) {
    bar = { ...bar, es: bar.displayEs ?? bar.es, ef: bar.displayEf ?? bar.ef };
    if (!Number.isFinite(bar.es) || !Number.isFinite(bar.ef) || bar.ef < bar.es) return null;
    if (bar.ef < scale.start || bar.es > scale.end) return null;
    const rawLeft = scale.timeToX(bar.es);
    const rawRight = scale.timeToX(bar.ef);
    if (!Number.isFinite(rawLeft) || !Number.isFinite(rawRight)) return null;
    if (bar.isMilestone) return bar.es < scale.start || bar.es > scale.end ? null : { left: rawLeft, right: rawLeft };
    if (bar.ef <= scale.start || bar.es >= scale.end) return null;
    const left = Math.max(0, rawLeft);
    const right = Math.min(scale.width, rawRight);
    if (right <= left) return null;
    // Keep short tasks operable without pushing them beyond the right edge.
    const visualLeft = Math.min(left, scale.width - 4);
    return { left: visualLeft, right: Math.min(scale.width, Math.max(right, visualLeft + 4)) };
}

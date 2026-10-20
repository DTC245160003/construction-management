// Decimal previews mirror fixed precision inputs without converting to binary floats.
export function decimalDifference(left, right, places = 4) {
  const scale = 10n ** BigInt(places);
  function scaled(value) {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value ?? ""));
    if (!match || (match[3]?.length || 0) > places) return null;
    const amount = BigInt(match[2]) * scale + BigInt((match[3] || "").padEnd(places, "0"));
    return match[1] ? -amount : amount;
  }
  const a = scaled(left), b = scaled(right);
  if (a === null || b === null) return null;
  const difference = a - b;
  const digits = (difference < 0n ? -difference : difference).toString().padStart(places + 1, "0");
  return `${difference < 0n ? "-" : ""}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

export function decimalLabel(value) {
  if (value == null || value === "") return "—";
  const [whole, fraction = ""] = String(value).split(".");
  const decimals = fraction.replace(/0+$/, "");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${decimals ? `,${decimals}` : ""}`;
}

export function outlineRows(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visited = new Set();
  const result = [];
  function visit(item, depth) {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    result.push({ ...item, depth });
    items.filter((child) => child.parent_id === item.id).forEach((child) => visit(child, depth + 1));
  }
  items.filter((item) => !byId.has(item.parent_id)).forEach((item) => visit(item, 0));
  items.forEach((item) => visit(item, 0));
  return result;
}

export function reportTiming(data) {
  return {
    baseline: data.baseline_finish || null,
    current: data.current_finish || data.forecast_finish || null,
    variance: data.finish_variance_days == null ? null : Number(data.finish_variance_days),
  };
}

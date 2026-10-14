// Utility for exact arbitrary-precision Decimal calculations without binary floating-point.
const SCALE_QUANTITY = 4;
const SCALE_CURRENCY = 2;

function parseDecimal(value, maxScale = 2, allowZero = true) {
    if (value === null || value === undefined || value === "") return null;
    const str = typeof value === "number" && Number.isFinite(value) ? String(value) : String(value).trim();
    if (!str) return null;
    
    // Pattern: optional negative (if allowed), digits, optional dot and decimal places
    const pattern = new RegExp(`^\\d{1,16}(\\.\\d{1,${maxScale}})?$`);
    if (!pattern.test(str)) {
        throw Object.assign(
            new Error(`Giá trị phải là số ${allowZero ? "không âm" : "lớn hơn 0"} và tối đa ${maxScale} chữ số thập phân`),
            { status: 400, expose: true }
        );
    }
    
    const [whole, fraction = ""] = str.split(".");
    const bigVal = BigInt(whole) * (10n ** BigInt(maxScale)) + BigInt(fraction.padEnd(maxScale, "0").slice(0, maxScale));
    if (!allowZero && bigVal === 0n) {
        throw Object.assign(
            new Error("Giá trị phải lớn hơn 0"),
            { status: 400, expose: true }
        );
    }
    
    return str;
}

function scaled(str, scale) {
    if (!str) return 0n;
    const [whole, fraction = ""] = String(str).trim().split(".");
    return BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, "0").slice(0, scale));
}

function formatScaled(valueBigInt, scale) {
    const isNegative = valueBigInt < 0n;
    const absVal = isNegative ? -valueBigInt : valueBigInt;
    const digits = absVal.toString().padStart(scale + 1, "0");
    const wholePart = digits.slice(0, -scale) || "0";
    const fracPart = digits.slice(-scale);
    return `${isNegative ? "-" : ""}${wholePart}.${fracPart}`;
}

// Multiply contract quantity (scale 4) by unit price (scale 2) -> contract amount (scale 2)
function calculateContractAmount(quantityStr, unitPriceStr) {
    if (!quantityStr || !unitPriceStr) return null;
    const q = scaled(quantityStr, SCALE_QUANTITY);
    const p = scaled(unitPriceStr, SCALE_CURRENCY);
    // Product has scale 6 (4 + 2)
    const product = q * p;
    // Divide by 10^4 with half-up rounding to get scale 2
    const divisor = 10000n;
    const half = divisor / 2n;
    const rounded = (product + half) / divisor;
    return formatScaled(rounded, SCALE_CURRENCY);
}

// Add two currency strings (scale 2)
function addCurrency(amount1Str, amount2Str) {
    const a = scaled(amount1Str || "0", SCALE_CURRENCY);
    const b = scaled(amount2Str || "0", SCALE_CURRENCY);
    return formatScaled(a + b, SCALE_CURRENCY);
}

// Hierarchical rollup of contract amounts for work item tree
function rollupWorkItemTree(items) {
    if (!Array.isArray(items)) return [];
    
    const parentIds = new Set(
        items.map(item => item.parent_id).filter(id => id != null)
    );
    
    const childrenMap = new Map();
    for (const item of items) {
        const pid = item.parent_id ?? null;
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid).push(item);
    }
    
    const leafAmountMap = new Map();
    const hasAnyContractMap = new Map();
    
    function computeSubtree(item) {
        const isLeaf = !parentIds.has(item.id);
        if (isLeaf) {
            let amount = null;
            let hasContract = false;
            if (item.contract_quantity != null && item.contract_unit_price != null) {
                amount = calculateContractAmount(item.contract_quantity, item.contract_unit_price);
                hasContract = true;
            } else if (item.contract_quantity != null || item.contract_unit_price != null) {
                hasContract = true;
            }
            leafAmountMap.set(item.id, amount ? scaled(amount, SCALE_CURRENCY) : 0n);
            hasAnyContractMap.set(item.id, hasContract);
            return {
                sumScaled: amount ? scaled(amount, SCALE_CURRENCY) : 0n,
                hasAny: hasContract
            };
        }
        
        const children = childrenMap.get(item.id) || [];
        let totalScaled = 0n;
        let anyChildHasContract = false;
        
        for (const child of children) {
            const childResult = computeSubtree(child);
            totalScaled += childResult.sumScaled;
            if (childResult.hasAny) anyChildHasContract = true;
        }
        
        leafAmountMap.set(item.id, totalScaled);
        hasAnyContractMap.set(item.id, anyChildHasContract);
        return {
            sumScaled: totalScaled,
            hasAny: anyChildHasContract
        };
    }
    
    const rootItems = childrenMap.get(null) || items.filter(it => it.parent_id == null);
    for (const root of rootItems) {
        computeSubtree(root);
    }
    for (const item of items) {
        if (!leafAmountMap.has(item.id)) {
            computeSubtree(item);
        }
    }
    
    return items.map(item => {
        const isLeaf = !parentIds.has(item.id);
        if (isLeaf) {
            const contract_amount = (item.contract_quantity != null && item.contract_unit_price != null)
                ? calculateContractAmount(item.contract_quantity, item.contract_unit_price)
                : null;
            return {
                ...item,
                is_leaf: true,
                contract_quantity: item.contract_quantity != null ? String(item.contract_quantity) : null,
                unit: item.unit != null ? String(item.unit) : null,
                contract_unit_price: item.contract_unit_price != null ? String(item.contract_unit_price) : null,
                contract_amount
            };
        } else {
            const hasAny = hasAnyContractMap.get(item.id);
            const totalScaled = leafAmountMap.get(item.id) || 0n;
            const contract_amount = hasAny ? formatScaled(totalScaled, SCALE_CURRENCY) : null;
            return {
                ...item,
                is_leaf: false,
                contract_quantity: null,
                unit: null,
                contract_unit_price: null,
                contract_amount
            };
        }
    });
}

module.exports = {
    SCALE_QUANTITY,
    SCALE_CURRENCY,
    parseDecimal,
    scaled,
    formatScaled,
    calculateContractAmount,
    addCurrency,
    rollupWorkItemTree
};

const fs = require("node:fs");
const path = require("node:path");
const { expect } = require("@jest/globals");

const after019Names = fs.readdirSync(path.join(__dirname, "../../src/migrations"))
    .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name) && Number(name.slice(0, 3)) > 19)
    .sort();
const after019Applied = after019Names.map(name => `Applied: ${name}`);

// Older schema tests target a particular historical guard. Assert all newer
// migrations roll back first so the original data-loss assertions still run.
async function rollbackAfter019(migrate) {
    for (const name of [...after019Names].reverse()) {
        expect(await migrate("down")).toEqual([`Rolled back: ${name}`]);
    }
}

module.exports = { after019Names, after019Applied, rollbackAfter019 };

const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const {verifiedLegacyHistory}=require('./migrationCompatibility');

const LEGACY_MIGRATION = "001_create_users.sql";
const COMMANDS = ["up", "down", "status", "baseline"];
// These independent migrations shipped on separate branches with version 017.
// Keep their names and SQL intact so existing history/checksums remain valid.
const JOURNAL_LOCK_MIGRATION = "017_add_lock_fields_to_daily_logs.sql";
const SPRINT45_MIGRATION = "017_sprint4_5.sql";
const ARCHIVED_TASK_DEPENDENCIES = "009_create_task_dependencies.sql";

function readMigrations(directory) {
    const names = fs.readdirSync(directory)
        .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
        .sort();

    if (names.length === 0) {
        throw new Error("No migrations found.");
    }

    for (const name of names) {
        const sameVersion = names.filter(candidate => candidate.slice(0, 3) === name.slice(0, 3));
        if (sameVersion.length > 1 && !(sameVersion.length === 2
            && sameVersion.includes(JOURNAL_LOCK_MIGRATION)
            && sameVersion.includes(SPRINT45_MIGRATION))) {
            throw new Error("Migration version numbers must be unique.");
        }
    }

    return names.map(name => {
        // Keep checksums stable across Windows and Linux checkouts.
        const sql = fs.readFileSync(path.join(directory, name), "utf8")
            .replace(/\r\n/g, "\n");
        const downPath = path.join(directory, name.replace(/\.sql$/, ".down.sql"));

        return {
            name,
            sql,
            checksum: createHash("sha256").update(sql).digest("hex"),
            downSql: fs.existsSync(downPath)
                ? fs.readFileSync(downPath, "utf8")
                : null
        };
    });
}

function validateHistory(migrations, applied) {
    for (const [index, entry] of applied.entries()) {
        const migration = migrations[index];
        if (!migration || migration.name !== entry.name) {
            throw new Error("Migration history does not match the ordered migration files.");
        }
        if (migration.checksum !== entry.checksum) {
            throw new Error(`Applied migration has changed: ${entry.name}`);
        }
    }
}

async function validateLegacyUsers(client) {
    const { rows } = await client.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable,
               column_default
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users'
        ORDER BY ordinal_position
    `);

    const expected = [
        ["id", "integer", null, "NO"],
        ["username", "character varying", 100, "NO"],
        ["email", "character varying", 150, "NO"],
        ["password", "character varying", 255, "NO"],
        ["created_at", "timestamp without time zone", null, "YES"],
        ["updated_at", "timestamp without time zone", null, "YES"]
    ];
    const actual = rows.map(row => [
        row.column_name, row.data_type, row.character_maximum_length, row.is_nullable
    ]);
    const defaultsMatch = rows.length === 6
        && /^nextval\(/.test(rows[0].column_default || "")
        && rows.slice(1, 4).every(row => row.column_default === null)
        && rows.slice(4).every(row => row.column_default === "CURRENT_TIMESTAMP");

    if (JSON.stringify(actual) !== JSON.stringify(expected) || !defaultsMatch) {
        throw new Error("Baseline refused: users does not match the original T-01 schema.");
    }

    const constraints = await client.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND contype IN ('p', 'u')
    `);
    const definitions = constraints.rows.map(row => row.definition);
    if (!definitions.includes("PRIMARY KEY (id)") || !definitions.includes("UNIQUE (email)")) {
        throw new Error("Baseline refused: users must have a primary key on id and unique email.");
    }
}

async function createHistory(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) PRIMARY KEY,
            checksum VARCHAR(64) NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function recordMigration(client, migration) {
    await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum]
    );
}

async function runMigrations({
    client,
    command = "up",
    directory = path.join(__dirname, "migrations")
}) {
    if (!COMMANDS.includes(command)) {
        throw new Error(`Unknown migration command. Use: ${COMMANDS.join(", ")}.`);
    }

    const migrations = readMigrations(directory);
    const messages = [];
    await client.query(command === "status" ? "BEGIN READ ONLY" : "BEGIN");

    try {
        // Released automatically on COMMIT/ROLLBACK; prevent concurrent runners.
        const lock = await client.query(`
            SELECT pg_try_advisory_xact_lock(
                hashtext(current_database()),
                hashtext(current_schema() || ':construction-management:migrations')
            ) AS locked
        `);
        if (!lock.rows[0].locked) {
            throw new Error("Another migration runner is active. Try again after it finishes.");
        }

        const history = await client.query(
            "SELECT to_regclass('schema_migrations') IS NOT NULL AS present"
        );
        let applied = history.rows[0].present
            ? (await client.query("SELECT name, checksum FROM schema_migrations ORDER BY name")).rows
            : [];
        // This accidentally merged file duplicates version 009 and references
        // tasks before their canonical migration. Never rewrite a database
        // that somehow recorded it; its history needs explicit manual review.
        if (applied.some(entry => entry.name === ARCHIVED_TASK_DEPENDENCIES)) {
            throw new Error(`Archived invalid migration is recorded: ${ARCHIVED_TASK_DEPENDENCIES}. Manual review is required; no schema or migration history was changed.`);
        }
        // 832f3e6 shipped baseline/milestone as 015 before the actuals commit
        // was restored. Rename only its verified history entry; never rerun DDL.
        const legacyBaseline = applied.find(entry => entry.name === "015_create_baselines_and_milestones.sql");
        if (legacyBaseline) {
            const baseline = migrations.find(entry => entry.name === "016_create_baselines_and_milestones.sql");
            if (!baseline || baseline.checksum !== legacyBaseline.checksum || applied.some(entry => entry.name === baseline.name)) {
                throw new Error("Baseline migration checksum/history does not match; no history was changed.");
            }
            if (!["up", "status"].includes(command)) throw new Error("Run migrate up to normalize the baseline migration before rollback.");
            if (command === "up") await client.query("UPDATE schema_migrations SET name = $1 WHERE name = $2 AND checksum = $3",
                [baseline.name, legacyBaseline.name, legacyBaseline.checksum]);
            applied = applied.map(entry => entry === legacyBaseline ? { ...entry, name: baseline.name } : entry);
        }
        const actualsMissing = !applied.some(entry => entry.name === "015_add_task_actuals.sql")
            && applied.some(entry => entry.name === "016_create_baselines_and_milestones.sql");
        // A deployed Sprint 4–5 database may already include 018 without main's
        // independent lock columns. Permit only this known missing migration;
        // every other entry must still match the ordered files and checksum.
        const journalLockMissing = !applied.some(entry => entry.name === JOURNAL_LOCK_MIGRATION)
            && applied.some(entry => entry.name === SPRINT45_MIGRATION)
            && applied.every(entry => entry.name <= "018_system_administration.sql");
        validateHistory(migrations.filter(entry => !(actualsMissing && entry.name === "015_add_task_actuals.sql")
            && !(journalLockMissing && entry.name === JOURNAL_LOCK_MIGRATION)), await verifiedLegacyHistory(client,migrations,applied));
        const appliedNames = new Set(applied.map(entry => entry.name));

        if (command === "status") {
            for (const migration of migrations) {
                messages.push(`${appliedNames.has(migration.name) ? "applied" : "pending"}: ${migration.name}`);
            }
        } else if (command === "baseline") {
            if (applied.length !== 0 || migrations[0].name !== LEGACY_MIGRATION) {
                throw new Error("Baseline is only for an existing T-01 database with no recorded migrations.");
            }
            await validateLegacyUsers(client);
            await createHistory(client);
            await recordMigration(client, migrations[0]);
            messages.push(`Recorded existing schema: ${LEGACY_MIGRATION}`);
        } else if (command === "up") {
            if (applied.length === 0 && migrations[0].name === LEGACY_MIGRATION) {
                const users = await client.query("SELECT to_regclass('users') IS NOT NULL AS present");
                if (users.rows[0].present) {
                    throw new Error("Existing users table detected. Review and run npm run migrate:baseline first.");
                }
            }

            const pending = migrations.filter(migration => !appliedNames.has(migration.name));
            if (pending.length > 0) {
                await createHistory(client);
                for (const migration of pending) {
                    await client.query(migration.sql);
                    await recordMigration(client, migration);
                    messages.push(`Applied: ${migration.name}`);
                }
            } else {
                messages.push("No pending migrations.");
            }
        } else if (applied.length === 0) {
            messages.push("No migrations to rollback.");
        } else {
            const latest = migrations.filter(migration => appliedNames.has(migration.name)).at(-1);
            if (!latest.downSql) {
                throw new Error(`No rollback file for ${latest.name}; the original schema is preserved.`);
            }
            await client.query(latest.downSql);
            await client.query("DELETE FROM schema_migrations WHERE name = $1", [latest.name]);
            messages.push(`Rolled back: ${latest.name}`);
        }

        await client.query("COMMIT");
        return messages;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            throw new AggregateError(
                [error, rollbackError],
                "Migration and transaction rollback both failed.",
                { cause: rollbackError }
            );
        }
        throw error;
    }
}

async function main() {
    const command = process.argv[2] || "up";
    if (process.argv.length > 3 || !COMMANDS.includes(command)) {
        throw new Error(`Usage: node src/run-migration.js [${COMMANDS.join("|")}]`);
    }

    const pool = require("./config/database");
    let client;
    try {
        client = await pool.connect();
        const messages = await runMigrations({ client, command });
        messages.forEach(message => console.log(message));
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { runMigrations };

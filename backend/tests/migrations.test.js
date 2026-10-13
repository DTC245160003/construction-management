const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { runMigrations } = require("../src/run-migration");

const directory = path.join(__dirname, "../src/migrations");
const names = fs.readdirSync(directory)
    .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
const sql = names.map(name => fs.readFileSync(path.join(directory, name), "utf8")
    .replace(/\r\n/g, "\n"));
const downSql = names.slice(1).map(name => fs.readFileSync(
    path.join(directory, name.replace(/\.sql$/, ".down.sql")), "utf8"
));
const history = names.map((name, index) => ({
    name,
    checksum: createHash("sha256").update(sql[index]).digest("hex")
}));

function legacyColumns() {
    return [
        ["id", "integer", null, "NO", "nextval('users_id_seq'::regclass)"],
        ["username", "character varying", 100, "NO", null],
        ["email", "character varying", 150, "NO", null],
        ["password", "character varying", 255, "NO", null],
        ["created_at", "timestamp without time zone", null, "YES", "CURRENT_TIMESTAMP"],
        ["updated_at", "timestamp without time zone", null, "YES", "CURRENT_TIMESTAMP"]
    ].map(([column_name, data_type, character_maximum_length, is_nullable, column_default]) => ({
        column_name, data_type, character_maximum_length, is_nullable, column_default
    }));
}

function makeClient({
    applied = null,
    usersExist = false,
    columns = legacyColumns(),
    constraints = ["PRIMARY KEY (id)", "UNIQUE (email)"],
    locked = true,
    failSql = null,
    failure = new Error("Database rejected migration")
} = {}) {
    return {
        query: jest.fn(async statement => {
            if (statement === failSql) throw failure;
            if (statement.includes("pg_try_advisory_xact_lock")) {
                return { rows: [{ locked }] };
            }
            if (statement.includes("to_regclass('schema_migrations')")) {
                return { rows: [{ present: applied !== null }] };
            }
            if (statement === "SELECT name, checksum FROM schema_migrations ORDER BY name") {
                return { rows: applied || [] };
            }
            if (statement.includes("to_regclass('users')")) {
                return { rows: [{ present: usersExist }] };
            }
            if (statement.includes("FROM information_schema.columns")) {
                return { rows: columns };
            }
            if (statement.includes("FROM pg_constraint")) {
                return { rows: constraints.map(definition => ({ definition })) };
            }
            if (["BEGIN", "BEGIN READ ONLY", "COMMIT", "ROLLBACK"].includes(statement)
                || statement.includes("CREATE TABLE IF NOT EXISTS schema_migrations")
                || statement.startsWith("INSERT INTO schema_migrations")
                || statement.startsWith("UPDATE schema_migrations SET name")
                || statement.startsWith("DELETE FROM schema_migrations")
                || sql.includes(statement) || downSql.includes(statement)) {
                return { rows: [] };
            }
            throw new Error(`Unexpected query in test: ${statement}`);
        })
    };
}

function statements(client) {
    return client.query.mock.calls.map(([statement]) => statement);
}

describe("Migration runner (no database connection)", () => {
    const history016 = history.find(entry => entry.name === "016_create_baselines_and_milestones.sql");
    test("adopts the verified 015 baseline history and applies actuals without rerunning baseline DDL", async () => {
        const legacy = { ...history016, name: "015_create_baselines_and_milestones.sql" };
        const client = makeClient({ applied: [...history.slice(0, 14), legacy] });
        expect(await runMigrations({ client })).toEqual([
            "Applied: 015_add_task_actuals.sql", "Applied: 017_add_lock_fields_to_daily_logs.sql",
            "Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql",
            "Applied: 019_reconcile_journal_lock_guards.sql"
        ]);
        expect(statements(client).filter(statement => sql.includes(statement))).toEqual([sql[14], ...sql.slice(16)]);
        expect(client.query).toHaveBeenCalledWith("UPDATE schema_migrations SET name = $1 WHERE name = $2 AND checksum = $3",
            [history016.name, legacy.name, legacy.checksum]);
    });
    test("legacy baseline status is read-only and an unknown checksum is rejected", async () => {
        const legacy = { ...history016, name: "015_create_baselines_and_milestones.sql" };
        const client = makeClient({ applied: [...history.slice(0, 14), legacy] });
        const messages = await runMigrations({ client, command: "status" });
        expect(messages.slice(14)).toEqual([
            "pending: 015_add_task_actuals.sql", "applied: 016_create_baselines_and_milestones.sql",
            "pending: 017_add_lock_fields_to_daily_logs.sql", "pending: 017_sprint4_5.sql",
            "pending: 018_system_administration.sql", "pending: 019_reconcile_journal_lock_guards.sql"
        ]);
        expect(statements(client).some(statement => statement.startsWith("UPDATE"))).toBe(false);
        await expect(runMigrations({ client: makeClient({ applied: [...history.slice(0, 14), { ...legacy, checksum: "bad" }] }) })).rejects.toThrow("checksum/history");
    });
    test("fresh install applies only up files in order and commits", async () => {
        const client = makeClient();
        const messages = await runMigrations({ client });

        expect(statements(client).filter(statement => sql.includes(statement))).toEqual(sql);
        expect(statements(client).some(statement => downSql.includes(statement))).toBe(false);
        expect(messages).toEqual(names.map(name => `Applied: ${name}`));
        expect(statements(client).at(-1)).toBe("COMMIT");
        expect(client.query).not.toHaveBeenCalledWith("ROLLBACK");
    });

    test("rerunning up skips all recorded migrations", async () => {
        const client = makeClient({ applied: history });
        await expect(runMigrations({ client })).resolves.toEqual(["No pending migrations."]);
        expect(statements(client).filter(statement => sql.includes(statement))).toEqual([]);
        expect(statements(client).some(statement => statement.startsWith("INSERT"))).toBe(false);
    });

    test("upgrades main's S-24 history without changing its lock migration", async () => {
        const applied = history.filter(entry => entry.name <= "017_add_lock_fields_to_daily_logs.sql");
        const client = makeClient({ applied });
        await expect(runMigrations({ client })).resolves.toEqual([
            "Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql",
            "Applied: 019_reconcile_journal_lock_guards.sql"
        ]);
        expect(statements(client).filter(statement => sql.includes(statement)))
            .toEqual(sql.filter((_, index) => !applied.some(entry => entry.name === names[index])));
        expect(statements(client).some(statement => statement.startsWith("UPDATE schema_migrations"))).toBe(false);
    });

    test("upgrades deployed Sprint 4-5 and 018 without replaying their SQL", async () => {
        const applied = history.filter(entry => entry.name !== "017_add_lock_fields_to_daily_logs.sql"
            && entry.name <= "018_system_administration.sql");
        const client = makeClient({ applied });
        await expect(runMigrations({ client })).resolves.toEqual([
            "Applied: 017_add_lock_fields_to_daily_logs.sql", "Applied: 019_reconcile_journal_lock_guards.sql"
        ]);
        expect(statements(client).filter(statement => sql.includes(statement))).toEqual([
            sql[names.indexOf("017_add_lock_fields_to_daily_logs.sql")], sql.at(-1)
        ]);
        expect(statements(client).some(statement => statement.startsWith("UPDATE schema_migrations"))).toBe(false);
    });

    test("status reports the known Sprint 4-5 history gap without changing history", async () => {
        const applied = history.filter(entry => entry.name !== "017_add_lock_fields_to_daily_logs.sql"
            && entry.name <= "018_system_administration.sql");
        const client = makeClient({ applied });
        expect((await runMigrations({ client, command: "status" })).slice(16)).toEqual([
            "pending: 017_add_lock_fields_to_daily_logs.sql", "applied: 017_sprint4_5.sql",
            "applied: 018_system_administration.sql", "pending: 019_reconcile_journal_lock_guards.sql"
        ]);
        expect(statements(client).some(statement => /CREATE|INSERT|UPDATE|DELETE/.test(statement))).toBe(false);
    });

    test.each(["017_add_lock_fields_to_daily_logs.sql", "017_sprint4_5.sql", "018_system_administration.sql"])(
        "branch upgrades reject a changed checksum for %s", async name => {
            const applied = history.filter(entry => entry.name <= "018_system_administration.sql"
                && (name === "017_add_lock_fields_to_daily_logs.sql" || entry.name !== "017_add_lock_fields_to_daily_logs.sql"))
                .map(entry => entry.name === name ? { ...entry, checksum: "bad" } : entry);
            const client = makeClient({ applied });
            await expect(runMigrations({ client })).rejects.toThrow(`Applied migration has changed: ${name}`);
            expect(statements(client).filter(statement => sql.includes(statement))).toEqual([]);
            expect(statements(client).at(-1)).toBe("ROLLBACK");
        }
    );

    test.each(["014_create_project_invitations.sql", "017_add_lock_fields_to_daily_logs.sql", "017_sprint4_5.sql", "018_system_administration.sql"])(
        "branch compatibility still rejects an unrelated history gap at %s", async name => {
            const client = makeClient({ applied: history.filter(entry => entry.name !== name) });
            await expect(runMigrations({ client })).rejects.toThrow("Migration history does not match");
            expect(statements(client).filter(statement => sql.includes(statement))).toEqual([]);
        }
    );

    test("unordered and unknown history entries are rejected", async () => {
        for (const applied of [[history[1], history[0]], [...history, { name: "999_unknown.sql", checksum: "bad" }]]) {
            const client = makeClient({ applied });
            await expect(runMigrations({ client })).rejects.toThrow("Migration history does not match");
            expect(statements(client).filter(statement => sql.includes(statement))).toEqual([]);
        }
    });

    test.each(["017_unrecognized.sql", "018_unrecognized.sql"])(
        "the released 017 pair does not permit another duplicate version: %s", async name => {
            const files = jest.spyOn(fs, "readdirSync").mockReturnValue([...names, name]);
            const client = makeClient();
            try {
                await expect(runMigrations({ client })).rejects.toThrow("Migration version numbers must be unique");
                expect(client.query).not.toHaveBeenCalled();
            } finally { files.mockRestore(); }
        }
    );

    test("an untracked T-01 table requires an explicit baseline", async () => {
        const client = makeClient({ usersExist: true });
        await expect(runMigrations({ client })).rejects.toThrow("migrate:baseline");
        expect(statements(client).filter(statement => sql.includes(statement))).toEqual([]);
        expect(statements(client).at(-1)).toBe("ROLLBACK");
        expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    });

    test("baseline records T-01 without rerunning its SQL", async () => {
        const client = makeClient({ usersExist: true });
        await runMigrations({ client, command: "baseline" });

        expect(client.query).toHaveBeenCalledWith(
            "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
            [history[0].name, history[0].checksum]
        );
        expect(statements(client).filter(statement => sql.includes(statement))).toEqual([]);
        expect(statements(client).at(-1)).toBe("COMMIT");
    });

    test("baseline rejects a different schema without recording it", async () => {
        const columns = legacyColumns();
        columns[2].character_maximum_length = 255;
        const client = makeClient({ usersExist: true, columns });

        await expect(runMigrations({ client, command: "baseline" }))
            .rejects.toThrow("does not match");
        expect(statements(client).some(statement => statement.startsWith("INSERT"))).toBe(false);
        expect(statements(client).at(-1)).toBe("ROLLBACK");
    });

    test("baseline requires the original unique email constraint", async () => {
        const client = makeClient({ constraints: ["PRIMARY KEY (id)"] });
        await expect(runMigrations({ client, command: "baseline" }))
            .rejects.toThrow("unique email");
        expect(statements(client).some(statement => statement.startsWith("INSERT"))).toBe(false);
    });

    test("upgrade applies new migrations without recreating users", async () => {
        const client = makeClient({ applied: history.slice(0, 1), usersExist: true });
        await runMigrations({ client });
        expect(statements(client).filter(statement => sql.includes(statement))).toEqual(sql.slice(1));
    });

    test("upgrade from T-04 applies only later migrations", async () => {
        const t04Count = names.indexOf("003_update_users.sql") + 1;
        const client = makeClient({ applied: history.slice(0, t04Count), usersExist: true });

        await runMigrations({ client });

        expect(statements(client).filter(statement => sql.includes(statement)))
            .toEqual(sql.slice(t04Count));
        expect(statements(client).at(-1)).toBe("COMMIT");
    });

    test("a failed upgrade rolls back SQL and history together", async () => {
        const failure = new Error("DDL failed");
        const client = makeClient({ applied: history.slice(0, 1), failSql: sql[2], failure });

        await expect(runMigrations({ client })).rejects.toBe(failure);
        expect(statements(client).at(-1)).toBe("ROLLBACK");
        expect(client.query).not.toHaveBeenCalledWith("COMMIT");
        expect(client.query).not.toHaveBeenCalledWith(
            "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
            [history[2].name, history[2].checksum]
        );
    });

    test("down rolls back only the latest migration", async () => {
        const client = makeClient({ applied: history });
        await runMigrations({ client, command: "down" });
        expect(statements(client).filter(statement => downSql.includes(statement))).toEqual([downSql.at(-1)]);
        expect(client.query).toHaveBeenCalledWith(
            "DELETE FROM schema_migrations WHERE name = $1", [names.at(-1)]
        );
        expect(statements(client).at(-1)).toBe("COMMIT");
    });

    test("a rollback refused by PostgreSQL retains migration history", async () => {
        const failure = new Error("Cannot rollback: existing data would be lost.");
        const client = makeClient({ applied: history, failSql: downSql.at(-1), failure });
        await expect(runMigrations({ client, command: "down" })).rejects.toBe(failure);
        expect(statements(client).some(statement => statement.startsWith("DELETE"))).toBe(false);
        expect(statements(client).at(-1)).toBe("ROLLBACK");
    });

    test("a refused T-04 users rollback retains its migration history", async () => {
        const index = names.indexOf("003_update_users.sql");
        const failure = new Error("Cannot rollback users: role assignments would be lost.");
        const client = makeClient({
            applied: history.slice(0, index + 1),
            failSql: downSql[index - 1],
            failure
        });

        await expect(runMigrations({ client, command: "down" })).rejects.toBe(failure);

        expect(statements(client).some(statement => statement.startsWith("DELETE"))).toBe(false);
        expect(statements(client).at(-1)).toBe("ROLLBACK");
    });

    test("a refused login-security rollback retains its migration history", async () => {
        const index = names.indexOf("004_add_login_security.sql");
        const failure = new Error("Cannot rollback login security: failed attempts or account locks would be lost.");
        const client = makeClient({
            applied: history.slice(0, index + 1),
            failSql: downSql[index - 1],
            failure
        });

        await expect(runMigrations({ client, command: "down" })).rejects.toBe(failure);

        expect(statements(client).some(statement => statement.startsWith("DELETE"))).toBe(false);
        expect(statements(client).at(-1)).toBe("ROLLBACK");
    });

    test("down never drops the original T-01 users table", async () => {
        const client = makeClient({ applied: history.slice(0, 1) });
        await expect(runMigrations({ client, command: "down" })).rejects.toThrow("No rollback file");
        expect(statements(client).some(statement => statement.startsWith("DELETE"))).toBe(false);
    });

    test("modified applied migrations are rejected", async () => {
        const client = makeClient({ applied: [{ ...history[0], checksum: "0".repeat(64) }] });
        await expect(runMigrations({ client })).rejects.toThrow("Applied migration has changed");
        expect(statements(client).filter(statement => sql.includes(statement))).toEqual([]);
    });

    test("status does not create a history table or execute migration SQL", async () => {
        const client = makeClient();
        await expect(runMigrations({ client, command: "status" }))
            .resolves.toEqual(names.map(name => `pending: ${name}`));
        expect(statements(client)[0]).toBe("BEGIN READ ONLY");
        expect(statements(client).some(statement => /CREATE|INSERT|DELETE/.test(statement))).toBe(false);
    });

    test("concurrent runners fail before changing schema", async () => {
        const client = makeClient({ locked: false });
        await expect(runMigrations({ client })).rejects.toThrow("Another migration runner");
        expect(statements(client).some(statement => /CREATE|INSERT|DELETE/.test(statement))).toBe(false);
        expect(statements(client).at(-1)).toBe("ROLLBACK");
    });

    test("an unknown command is rejected before connecting or starting a transaction", async () => {
        const client = makeClient();
        await expect(runMigrations({ client, command: "reset" })).rejects.toThrow("Unknown migration command");
        expect(client.query).not.toHaveBeenCalled();
    });
});

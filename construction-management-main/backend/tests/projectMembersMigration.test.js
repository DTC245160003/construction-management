const fs = require("fs");
const path = require("path");

const migrationDirectory = path.join(__dirname, "../src/migrations");
const upMigration = fs.readFileSync(
    path.join(migrationDirectory, "007_create_project_members.sql"),
    "utf8"
);
const downMigration = fs.readFileSync(
    path.join(migrationDirectory, "007_create_project_members.down.sql"),
    "utf8"
);

describe("T-06 project_members migration", () => {
    test("creates the project membership table and required constraints", () => {
        expect(upMigration).toContain("CREATE TABLE project_members");
        expect(upMigration).toContain("user_id INTEGER NOT NULL");
        expect(upMigration).toContain("project_id INTEGER NOT NULL");
        expect(upMigration).toContain("role_id INTEGER NOT NULL");
        expect(upMigration).toMatch(
            /REFERENCES users\(id\)/
        );
        expect(upMigration).toMatch(
            /REFERENCES roles\(id\)/
        );
        expect(upMigration).toMatch(
            /UNIQUE \(user_id, project_id\)/
        );
    });

    test("indexes project_id for project-scoped membership queries", () => {
        expect(upMigration).toMatch(
            /CREATE INDEX project_members_project_id_idx ON project_members \(project_id\)/
        );
    });

    test("rollback protects existing membership data", () => {
        expect(downMigration).toContain(
            "LOCK TABLE project_members IN ACCESS EXCLUSIVE MODE"
        );
        expect(downMigration).toMatch(
            /IF EXISTS \(SELECT 1 FROM project_members\)/
        );
        expect(downMigration).toContain(
            "Cannot rollback project members: the table contains membership data."
        );
        expect(downMigration).toContain(
            "DROP INDEX project_members_project_id_idx"
        );
        expect(downMigration).toContain("DROP TABLE project_members");
    });
});

const fs = require("fs");
const path = require("path");

const migrationDirectory = path.join(__dirname, "../src/migrations");
const upMigration = fs.readFileSync(
    path.join(migrationDirectory, "008_create_projects_and_work_items.sql"),
    "utf8"
);
const downMigration = fs.readFileSync(
    path.join(migrationDirectory, "008_create_projects_and_work_items.down.sql"),
    "utf8"
);

describe("T-08 projects and work_items migration", () => {
    test("creates projects and self-referencing work items", () => {
        expect(upMigration).toContain("CREATE TABLE projects");
        expect(upMigration).toContain("CREATE TABLE work_items");
        expect(upMigration).toMatch(
            /REFERENCES work_items\(id\) ON DELETE RESTRICT/
        );
        expect(upMigration).toMatch(
            /CREATE INDEX work_items_parent_id_idx ON work_items \(parent_id\)/
        );
        expect(upMigration).toContain(
            "ADD CONSTRAINT project_members_project_id_fkey"
        );
    });

    test("rollback protects project and work item data", () => {
        expect(downMigration).toMatch(/IF EXISTS \(SELECT 1 FROM work_items\)/);
        expect(downMigration).toMatch(/IF EXISTS \(SELECT 1 FROM projects\)/);
        expect(downMigration).toContain(
            "DROP CONSTRAINT project_members_project_id_fkey"
        );
        expect(downMigration).toContain("DROP TABLE work_items");
        expect(downMigration).toContain("DROP TABLE projects");
    });
});

# Archived duplicate task dependency migration

`009_create_task_dependencies.sql` and its empty down file were accidentally integrated into main beside the released `009_create_tasks.sql`. The duplicate version fails migration discovery; alphabetic ordering would also try to create foreign keys to `tasks` before that table exists. The application uses the canonical `dependencies` table created by migration 010, rather than this unused `task_dependencies` table.

Both files are preserved without changing their bytes and moved outside active migration discovery. This repairs fresh installations and upgrades with the canonical history. No released migration 017, 018, 019 or 020 is changed.

If `schema_migrations` already records the archived file, the runner refuses every command before schema/history writes. An operator must inspect that exceptional database manually; the runner never deletes or renames its recorded history or its data.

The up file's SHA-256 after normalizing CRLF to LF is `7e0b00c4741e42d42700b1284cacc035959ac087ac2a1f90050fd08a7a1a6414`. The empty down file's SHA-256 is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## Verified original invitation migration checksum

`014_create_project_invitations_legacy.sql` preserves the SQL statements
associated with the original application's recorded checksum. Its normalized SHA-256 is
`d2ce227d0f6e488b274180e3069a181284d521a11a4ae7ae42ea363f87bd156f`.
The complete statements are identical to canonical 014 after trimming the end;
the archived file has one extra final newline (1055 versus 1054 UTF-8 bytes).
This candidate was derived from the canonical source and verified against the
recorded SHA-256; it was not found as an exact historical Git blob. Both full
source checksums and exact trimmed-source equality are verified explicitly.

The runner recognizes only this checksum and checks required invitation/user
columns. It never rewrites the recorded checksum. Token columns/index already
belong to the unchanged released `017_sprint4_5.sql`; no extra DDL is required
for a newline-only difference. Existing users, roles and invitations remain.
All other unknown checksums still fail closed. This file is provenance, not an
additional active migration.

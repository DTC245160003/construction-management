# Sprint 4–5

Git baseline: `main` / `f6be4a2`. Implementation lives in `.worktrees/sprint4-5` on `feature/sprint4-5`. The original worktree and uncommitted T46–T47 files are preserved.

- [x] S-28: secure invitations, membership, role labels, last-manager protection
- [x] S-25: teams, assignment, overload, reassignment history and team access
- [x] S-26: ordered mobile tasks, critical badges, daily quantities and cumulative warnings
- [x] S-21: journal CRUD, filters, project item validation and mobile detail
- [x] S-22: configurable weather/equipment, unique daily header and rainy-week comparison
- [x] S-23: client compression, originals/EXIF, thumbnails, private access and retry
- [x] S-24: server/DB day locks, photo/sync guards, reasoned audited unlock
- [x] S-27 implementation/local tests: installable shell, controlled updates and shell-only cache
- [x] S-29: durable identity-scoped IndexedDB drafts/photos, quota/persistence
- [x] S-30 implementation/local tests: journal-first queue, bounded retry, PostgreSQL idempotency and Background Sync/fallback
- [x] S-31: local journal/photo counts, states, errors and last success
- [x] S-32: immutable versions/conflicts, safe field merge and resolution UI
- [x] S-33: independent bounded photo queue, placeholders, checksums and safe replay
- [x] S-34 implementation/local tests: real-PostgreSQL offline/reload/browser-restart/20-entry/30-photo/replay E2E and CI artifacts
- [x] Regression, migration up/down, native T46/T47 backup/restore and final report with measured results

Implementation checks above do not imply full acceptance. Final status: 11 PASS / 0 FAIL / 3 BLOCKED. See [SPRINT4_SPRINT5_REPORT.md](SPRINT4_SPRINT5_REPORT.md).

- [ ] S-27 acceptance: real-phone Home Screen installation and standalone behavior
- [ ] S-30 acceptance: native OS/browser sync while the app remains closed
- [ ] S-34 acceptance: remote CI run, logs/artifacts and measured runner duration
- [ ] Environment: Docker daemon-based checks
- [ ] Existing database upgrade: resolve pre-existing migration 014 checksum history mismatch without rewriting applied migrations

CREATE TABLE acceptance_sheets (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    period_number VARCHAR(100) NOT NULL,
    sheet_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'REJECTED')),
    notes TEXT DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_acceptance_sheets_project ON acceptance_sheets(project_id, status);
CREATE INDEX idx_acceptance_sheets_date ON acceptance_sheets(sheet_date DESC);

CREATE TABLE acceptance_items (
    id SERIAL PRIMARY KEY,
    acceptance_sheet_id INTEGER NOT NULL REFERENCES acceptance_sheets(id) ON DELETE CASCADE,
    work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    current_cumulative NUMERIC(18, 4) NOT NULL CHECK (current_cumulative >= 0),
    previous_approved_cumulative NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (previous_approved_cumulative >= 0),
    period_qty NUMERIC(18, 4) NOT NULL,
    site_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_acceptance_items_sheet ON acceptance_items(acceptance_sheet_id);
CREATE INDEX idx_acceptance_items_work_item ON acceptance_items(work_item_id);

ALTER TABLE work_items
    DROP COLUMN IF EXISTS contract_quantity,
    DROP COLUMN IF EXISTS unit,
    DROP COLUMN IF EXISTS contract_unit_price;

ALTER TABLE work_items
    ADD COLUMN contract_quantity NUMERIC(18,4) CHECK (contract_quantity IS NULL OR contract_quantity > 0),
    ADD COLUMN unit VARCHAR(50),
    ADD COLUMN contract_unit_price NUMERIC(18,2) CHECK (contract_unit_price IS NULL OR contract_unit_price >= 0);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_contracts') THEN
        UPDATE work_items w
        SET contract_quantity = c.quantity,
            unit = c.unit,
            contract_unit_price = c.unit_price
        FROM item_contracts c
        WHERE w.id = c.work_item_id;
    END IF;
END $$;

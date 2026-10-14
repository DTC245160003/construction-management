ALTER TABLE users RENAME COLUMN password TO password_hash;

ALTER TABLE users
    ALTER COLUMN email TYPE VARCHAR(255),
    ALTER COLUMN username DROP NOT NULL,
    ADD COLUMN role_id INTEGER
        CONSTRAINT users_role_id_fkey REFERENCES roles(id) ON DELETE RESTRICT;

-- Preserve legacy usernames without requiring them for new accounts.
CREATE INDEX users_role_id_idx ON users (role_id);

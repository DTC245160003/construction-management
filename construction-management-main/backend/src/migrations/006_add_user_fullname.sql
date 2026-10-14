-- Existing accounts keep their data; new registrations require fullname in the API.
ALTER TABLE users ADD COLUMN fullname VARCHAR(255);

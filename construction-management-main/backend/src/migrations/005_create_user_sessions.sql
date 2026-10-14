CREATE TABLE user_sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);

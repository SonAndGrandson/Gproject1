CREATE TABLE IF NOT EXISTS monitors (
    id SERIAL PRIMARY KEY,
    url VARCHAR(255) NOT NULL,
    interval_seconds INT NOT NULL CHECK (interval_seconds > 0),
    is_active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS res_checking (
    id SERIAL PRIMARY KEY,
    monitor_id INT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    status_code INT,
    is_up BOOLEAN NOT NULL,
    response_time_ms INT CHECK (response_time_ms >= 0),
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_res_checking_monitor_time
ON res_checking(monitor_id, checked_at DESC);

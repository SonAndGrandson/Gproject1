INSERT INTO monitors (url, interval_seconds, is_active)
VALUES
    ('https://google.com', 60, TRUE),
    ('https://github.com', 120, TRUE),
    ('https://example.com', 30, FALSE);


INSERT INTO res_checking
(monitor_id, status_code, is_up, response_time_ms, error_message)
VALUES
(1, 200, TRUE, 120, NULL),
(1, 200, TRUE, 150, NULL),
(1, 503, FALSE, 850, 'Service Unavailable'),
(1, 200, TRUE, 110, NULL),

(2, 200, TRUE, 180, NULL),
(2, 500, FALSE, 950, 'Internal Server Error'),
(2, NULL, FALSE, NULL, 'Connection Timeout'),
(2, 200, TRUE, 160, NULL),

(3, 200, TRUE, 90, NULL),
(3, 404, FALSE, 130, 'Not Found');

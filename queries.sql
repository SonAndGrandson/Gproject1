SELECT monitors.url,
res_checking.status_code,
res_checking.is_up,
res_checking.response_time_ms
FROM monitors
JOIN res_checking on res_checking.monitor_id=monitors.id;




SELECT
    monitors.url,
    res_checking.monitor_id,

    COUNT(*) AS total_checks,

    COUNT(CASE WHEN res_checking.is_up = TRUE THEN 1 END)
        AS successful_checks

FROM monitors

JOIN res_checking
    ON monitors.id = res_checking.monitor_id

GROUP BY monitors.id, monitors.url, res_checking.monitor_id;

SELECT * FROM res_checking;

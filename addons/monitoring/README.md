# Database Monitoring Add-On
## Purpose
The add-on tracks database connection usage and sends an email alert when usage reaches 70% of `max_connections`. Alerts are stateful (sent once per state change) to avoid spam. Emails include detailed metrics.

## Key features
- Monitors connection usage (Usage = Threads / max_connections).
- Stateful notifications (one email per state change):
  - `OK` — Usage < 70% (back to normal).
  - `THRESHOLD` — Usage ≥ 70% (threshold exceeded).
  - `STATUS_ERROR` — failed to get `mysqladmin status`.
  - `MAXCONN_ERROR` — failed to get `max_connections` (`SHOW VARIABLES`).
- Metrics from `mysqladmin status` and `SHOW VARIABLES LIKE 'max_connections'`.
- Configurable schedule (Quartz cron) via add-on settings: 5, 10, 15, 20, 30, 40, 50 minutes.
- Runs on all `sqldb` nodes.

## How it works
1. Install:
   - Downloads `/usr/local/sbin/db-monitoring.sh` to `sqldb` nodes.
   - Creates a script runner `db-monitoring.js` that executes the shell script on all `sqldb` nodes, passing `USER_SESSION` and `USER_EMAIL`.
   - Creates a scheduler task with Quartz trigger `cron:0 0/N * ? * * *` (N is the chosen interval).
2. Runtime:
   - Reads DB credentials from `/.jelenv`: `REPLICA_USER`/`REPLICA_PSWD`.
   - Collects metrics: `mysqladmin status` and `SHOW VARIABLES LIKE 'max_connections'`.
   - Calculates usage and determines state (OK/THRESHOLD/ERROR).
   - Stores the last state in `/var/tmp/db-monitoring.status` and sends email only on state changes.
   - Logs to `/var/log/db-monitoring.log`.

## Email content and metrics
Emails are HTML with bold labels and `<br/>` line breaks. Included:
- Status:
  - Uptime — node uptime (days/hours/minutes).
  - Threads — current number of active connections.
  - Slow queries — number of slow queries.
  - Open tables — tables currently open.
  - Queries per second avg — average queries per second since start.
- max_connections — maximum concurrent connections.
- Current threads (connections) — current connections count.
- Usage — share of used connections (percent).
- Timestamp — report time.

## Logs and artifacts
- Monitoring log: `/var/log/db-monitoring.log` (start/finish, email send, errors).
- State file: `/var/tmp/db-monitoring.status` (last state to suppress duplicate emails).


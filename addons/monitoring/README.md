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
- Runs on all `sqldb` nodes (group execution).

## How it works
1. Install:
   - Downloads `/usr/local/sbin/db-monitoring.sh` to all `sqldb` nodes.
   - Creates a runner script `db-monitoring.js` that invokes the shell script on the `sqldb` group, passing `USER_SESSION` and `USER_EMAIL`.
   - Installs a system cron job `/etc/cron.d/db-monitoring` and sets interval via `setSchedulerInterval` (every `N` minutes): `*/N * * * * root /usr/local/sbin/db-monitoring.sh check`.
2. Runtime:
   - Reads DB credentials from `/.jelenv`: `REPLICA_USER`/`REPLICA_PSWD`.
   - Collects metrics: `mysqladmin status` and `SHOW VARIABLES LIKE 'max_connections'`.
   - Calculates usage and determines state (OK/THRESHOLD/ERROR).
   - Stores the last state in `/var/tmp/db-monitoring.status` and sends email only on state changes.
   - On state change, triggers platform event `onCustomNodeEvent [name:executeScript]`, which calls the runner script and sends the email.
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
- Cron: `/etc/cron.d/db-monitoring` (interval managed by the add-on).

## Configuration
- Monitoring interval is controlled in the add-on settings (5/10/15/20/30/40/50 minutes).
- The add-on updates cron with `setSchedulerInterval` to `*/N * * * *`.
- Email sending uses platform messaging API and requires valid `session` and `userEmail`, which are passed by the add-on during event handling.


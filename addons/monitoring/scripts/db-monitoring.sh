#!/bin/bash

DB_USER=""
DB_PASSWORD=""
MONITORING_LOG=/var/log/db-monitoring.log
STATUS_FILE=/var/tmp/db-monitoring.status
BODY_ERROR_PREFIX="MySQL/MariaDB monitoring error on ${ENV_NAME}"


# Accept USER_SESSION and USER_EMAIL via positional args if provided
if [ -n "$1" ]; then USER_SESSION="$1"; fi
if [ -n "$2" ]; then USER_EMAIL="$2"; fi

# email notification via Jelastic API
function sendEmailNotification(){
    if [ -e "/usr/lib/jelastic/modules/api.module" ]; then
        [ -e "/var/run/jem.pid" ] && return 0
        CURRENT_PLATFORM_MAJOR_VERSION=$(jem api apicall -s --connect-timeout 3 --max-time 15 [API_DOMAIN]/1.0/statistic/system/rest/getversion 2>/dev/null | jq .version | grep -o [0-9.]* | awk -F . '{print $1}')
        if [ "${CURRENT_PLATFORM_MAJOR_VERSION}" -ge "7" ]; then
            echo $(date) ${ENV_NAME} "Sending e-mail notification about high DB connections usage" | tee -a $MONITORING_LOG
            SUBJECT="${ENV_NAME}: MySQL connections usage reached threshold"
            BODY="$1"
            jem api apicall -s --connect-timeout 3 --max-time 15 [API_DOMAIN]/1.0/message/email/rest/send --data-urlencode "session=$USER_SESSION" --data-urlencode "to=$USER_EMAIL" --data-urlencode "subject=$SUBJECT" --data-urlencode "body=$BODY"
            if [[ $? != 0 ]]; then
                echo $(date) ${ENV_NAME} "Sending of e-mail notification failed" | tee -a $MONITORING_LOG
            else
                echo $(date) ${ENV_NAME} "E-mail notification is sent successfully" | tee -a $MONITORING_LOG
            fi
        elif [ -z "${CURRENT_PLATFORM_MAJOR_VERSION}" ]; then
            echo $(date) ${ENV_NAME} "Error when checking the platform version" | tee -a $MONITORING_LOG
        else
            echo $(date) ${ENV_NAME} "Email notification is not sent because this functionality is unavailable for current platform version." | tee -a $MONITORING_LOG
        fi
    else
        echo $(date) ${ENV_NAME} "Email notification is not sent because this functionality is unavailable for current platform version." | tee -a $MONITORING_LOG
    fi
}

# status helpers: send email once per status change
get_last_status(){
    [ -f "$STATUS_FILE" ] && cat "$STATUS_FILE" 2>/dev/null || echo ""
}

set_status(){
    echo "$1" > "$STATUS_FILE" 2>/dev/null || true
}

send_on_status_change(){
    local new_status="$1"
    shift
    local body="$*"
    local last_status="$(get_last_status)"
    if [ "$new_status" != "$last_status" ]; then
        sendEmailNotification "$body"
        set_status "$new_status"
    else
        echo "$(date) ${ENV_NAME} Status '$new_status' unchanged, skipping email" >> $MONITORING_LOG
    fi
}

echo "Monitoring started at $(date)" >> $MONITORING_LOG

# Read credentials from /.jelenv (REPLICA_USER/REPLICA_PSWD) only; if absent -> notify and exit
if [ ! -f "/.jelenv" ]; then
    BODY="${BODY_ERROR_PREFIX}

Issue: Credentials file /.jelenv not found
Action required: Ensure REPLICA_USER/REPLICA_PSWD are provisioned in /.jelenv
Timestamp: $(date)"
    echo "$BODY" >> $MONITORING_LOG
    send_on_status_change "CREDENTIALS_MISSING" "$BODY"
    echo "Monitoring finished at $(date)" >> $MONITORING_LOG
    exit 1
fi

source "/.jelenv"

DB_USER="$REPLICA_USER"
DB_PASSWORD="$REPLICA_PSWD"

if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    BODY="${BODY_ERROR_PREFIX}

Issue: Missing REPLICA_USER or REPLICA_PSWD in /.jelenv
Observed values: REPLICA_USER='${REPLICA_USER:-EMPTY}', REPLICA_PSWD='${REPLICA_PSWD:+SET}'
Action required: Populate both variables in /.jelenv
Timestamp: $(date)"
    echo "$BODY" >> $MONITORING_LOG
    send_on_status_change "CREDENTIALS_MISSING" "$BODY"
    echo "Monitoring finished at $(date)" >> $MONITORING_LOG
    exit 1
fi

# Collect metrics using mysqladmin status
STATUS_RAW=$(mysqladmin status -u"$DB_USER" -p"$DB_PASSWORD" 2>&1)
RET=$?
if [ $RET -ne 0 ] || [ -z "$STATUS_RAW" ]; then
    BODY="${BODY_ERROR_PREFIX}

Action: mysqladmin status
Exit code: $RET
Output:\n$STATUS_RAW
Timestamp: $(date)"
    echo "$BODY" >> $MONITORING_LOG
    send_on_status_change "STATUS_ERROR" "$BODY"
    echo "Monitoring finished at $(date)" >> $MONITORING_LOG
    exit 1
fi
STATUS="$STATUS_RAW"

# Example STATUS: "Uptime: 12345  Threads: 12  Questions: 34567  Slow queries: 0  Opens: 132  Flush tables: 1  Open tables: 64  Queries per second avg: 2.80"
UPTIME=$(echo "$STATUS" | awk -F'Uptime: |  ' '{print $2}')
THREADS=$(echo "$STATUS" | awk -F'Threads: |  ' '{print $3}')
QUESTIONS=$(echo "$STATUS" | awk -F'Questions: |  ' '{print $4}')
SLOW=$(echo "$STATUS" | awk -F'Slow queries: |  ' '{print $5}')
OPENS=$(echo "$STATUS" | awk -F'Opens: |  ' '{print $6}')
FLUSHES=$(echo "$STATUS" | awk -F'Flush tables: |  ' '{print $7}')
OPEN_TABLES=$(echo "$STATUS" | awk -F'Open tables: |  ' '{print $8}')
QPS=$(echo "$STATUS" | awk -F'Queries per second avg: ' '{print $2}')

# Get max_connections (prefer mysqladmin variables to stay within mysqladmin tooling)
VARS_RAW=$(mysqladmin variables -u"$DB_USER" -p"$DB_PASSWORD" 2>&1)
VARS_RC=$?
if [ $VARS_RC -eq 0 ]; then
    MAX_CONNECTIONS=$(echo "$VARS_RAW" | awk -F'|' '/max_connections/ {gsub(/ /,"",$0); print $3; exit}')
fi

if ! [[ "$MAX_CONNECTIONS" =~ ^[0-9]+$ ]]; then
    # fallback to mysql client if parsing failed or command failed
    FALLBACK_RAW=$(mysql -Nse "SHOW VARIABLES LIKE 'max_connections';" -u"$DB_USER" -p"$DB_PASSWORD" 2>&1)
    FALLBACK_RC=$?
    if [ $FALLBACK_RC -eq 0 ]; then
        MAX_CONNECTIONS=$(echo "$FALLBACK_RAW" | awk '{print $2}')
    fi
fi

if ! [[ "$MAX_CONNECTIONS" =~ ^[0-9]+$ ]]; then
    BODY="${BODY_ERROR_PREFIX}

Issue: Unable to determine max_connections
mysqladmin variables exit: $VARS_RC
mysqladmin variables output:\n$VARS_RAW
mysql fallback exit: ${FALLBACK_RC:-not_executed}
mysql fallback output:\n${FALLBACK_RAW:-N/A}
Timestamp: $(date)"
    echo "$BODY" >> $MONITORING_LOG
    send_on_status_change "MAXCONN_ERROR" "$BODY"
    # continue with MAX_CONNECTIONS=0 to avoid division errors
    MAX_CONNECTIONS=0
fi

# Calculate usage percentage (integer)
USAGE_PCT=0
if [ "$MAX_CONNECTIONS" -gt 0 ]; then
    USAGE_PCT=$(awk -v th="$THREADS" -v max="$MAX_CONNECTIONS" 'BEGIN { if (max>0) printf("%d", (th*100)/max); else print 0 }')
fi

# Compose metrics body
METRICS_BODY="MySQL/MariaDB connections usage alert on ${ENV_NAME}

Status: $STATUS
max_connections: $MAX_CONNECTIONS
Current threads (connections): $THREADS
Usage: ${USAGE_PCT}%
Uptime: $UPTIME sec
Questions: $QUESTIONS
Slow queries: $SLOW
Opens: $OPENS
Flush tables: $FLUSHES
Open tables: $OPEN_TABLES
QPS (avg): $QPS
Timestamp: $(date)"

echo "$METRICS_BODY" >> $MONITORING_LOG

# Determine status and send only on change
THRESHOLD=70
if [ "$USAGE_PCT" -ge "$THRESHOLD" ]; then
    send_on_status_change "THRESHOLD" "$METRICS_BODY"
else
    OK_BODY="MySQL/MariaDB connections back to normal on ${ENV_NAME}

Status: $STATUS
max_connections: $MAX_CONNECTIONS
Current threads (connections): $THREADS
Usage: ${USAGE_PCT}%
Timestamp: $(date)"
    send_on_status_change "OK" "$OK_BODY"
fi

echo "Monitoring finished at $(date)" >> $MONITORING_LOG

exit 0
#!/bin/bash
USER_SESSION="$1"
USER_EMAIL="$2"
THRESHOLD=70
MONITORING_LOG=/var/log/db-monitoring.log
STATUS_FILE=/var/tmp/db-monitoring.status
HOSTNAME_SHORT=$(hostname -s 2>/dev/null || hostname)
BODY_ERROR_PREFIX="DataBase monitoring error on ${HOSTNAME_SHORT}"
# email notification via Virtuozzo API
function sendEmailNotification(){
    if [ -e "/usr/lib/jelastic/modules/api.module" ]; then
        [ -e "/var/run/jem.pid" ] && return 0
        echo $(date) ${HOSTNAME_SHORT} "Sending e-mail notification about high DB connections usage" | tee -a $MONITORING_LOG
        SUBJECT="${HOSTNAME_SHORT}: MySQL connections usage reached threshold"
        BODY="$1"
        jem api apicall -s --connect-timeout 3 --max-time 15 [API_DOMAIN]/1.0/message/email/rest/send \
          --data-urlencode "session=$USER_SESSION" \
          --data-urlencode "to=$USER_EMAIL" \
          --data-urlencode "subject=$SUBJECT" \
          --data-urlencode body@- <<< "$BODY"
        if [[ $? != 0 ]]; then
            echo $(date) ${HOSTNAME_SHORT} "Sending of e-mail notification failed" | tee -a $MONITORING_LOG
        else
            echo $(date) ${HOSTNAME_SHORT} "E-mail notification is sent successfully" | tee -a $MONITORING_LOG
        fi
    else
        echo $(date) ${HOSTNAME_SHORT} "Email notification is not sent because this functionality is unavailable for current platform." | tee -a $MONITORING_LOG
    fi
}

function get_last_status(){
    [ -f "$STATUS_FILE" ] && cat "$STATUS_FILE" 2>/dev/null || echo ""
}

function set_status(){
    echo "$1" > "$STATUS_FILE" 2>/dev/null || true
}

# Build reusable metrics body
function build_metrics_body(){
    local title="$1"
    cat <<EOF
<div style="font-family:monospace">
<b>Database connections ${title} on ${HOSTNAME_SHORT}</b><br/>
<br/>
<b>STATUS</b><br/>
<b>Uptime:</b> $UPTIME_HUMAN<br/>
<b>Threads:</b> $THREADS<br/>
<b>Slow queries:</b> $SLOW<br/>
<b>Open tables:</b> $OPEN_TABLES<br/>
<b>QPS:</b> $QPS<br/>
<br/>
<b>Max connections:</b> $MAX_CONNECTIONS<br/>
<b>Current connections:</b> $THREADS<br/>
<b>Usage:</b> ${USAGE_PCT}%<br/>
<b>Timestamp:</b> $(date)
</div>
EOF
}

function send_on_status_change(){
    local new_status="$1"
    local body="$2"
    local last_status="$(get_last_status)"
    if [ "$new_status" != "$last_status" ]; then
        sendEmailNotification "$body"
        set_status "$new_status"
    else
        echo "$(date) ${HOSTNAME_SHORT} Status '$new_status' unchanged, skipping email" >> $MONITORING_LOG
    fi
}

# credentials check and load
function check_credentials(){
    source "/.jelenv"
    DB_USER="$REPLICA_USER"
    DB_PASSWORD="$REPLICA_PSWD"

    if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
        BODY="${BODY_ERROR_PREFIX}

Issue: Missing REPLICA_USER or REPLICA_PSWD in environment variables
Observed values: REPLICA_USER='${REPLICA_USER:-EMPTY}', REPLICA_PSWD='${REPLICA_PSWD:+SET}'
Action required: Populate both variables in environment variables
Timestamp: $(date)"
        echo "$BODY" >> $MONITORING_LOG
        send_on_status_change "CREDENTIALS_MISSING" "$BODY"
        echo "Monitoring finished at $(date)" >> $MONITORING_LOG
        exit 1
    fi
}

# collect DB metrics using mysqladmin and mysql client
function collect_metrics(){
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

    UPTIME=$(echo "$STATUS" | grep -o 'Uptime: [0-9]\+' | awk '{print $2}')
    THREADS=$(echo "$STATUS" | grep -o 'Threads: [0-9]\+' | awk '{print $2}')
    QUESTIONS=$(echo "$STATUS" | grep -o 'Questions: [0-9]\+' | awk '{print $2}')
    SLOW=$(echo "$STATUS" | grep -o 'Slow queries: [0-9]\+' | awk '{print $3}')
    OPENS=$(echo "$STATUS" | grep -o 'Opens: [0-9]\+' | awk '{print $2}')
    FLUSHES=$(echo "$STATUS" | grep -o 'Flush tables: [0-9]\+' | awk '{print $3}')
    OPEN_TABLES=$(echo "$STATUS" | grep -o 'Open tables: [0-9]\+' | awk '{print $3}')
    QPS=$(echo "$STATUS" | sed -n 's/.*Queries per second avg: \([0-9.]*\).*/\1/p')

    UPTIME_HUMAN="$UPTIME"
    if [[ "$UPTIME" =~ ^[0-9]+$ ]]; then
        D=$((UPTIME/86400))
        H=$(((UPTIME%86400)/3600))
        M=$(((UPTIME%3600)/60))
        UPTIME_HUMAN="${D} days ${H} hours ${M} minutes"
    fi

    VAR_RAW=$(mysql -Nse "SHOW VARIABLES LIKE 'max_connections';" -u"$DB_USER" -p"$DB_PASSWORD" 2>&1)
    VAR_RC=$?
    if [ $VAR_RC -eq 0 ]; then
        MAX_CONNECTIONS=$(echo "$VAR_RAW" | awk '{print $2}')
    fi

    if ! [[ "$MAX_CONNECTIONS" =~ ^[0-9]+$ ]]; then
        BODY="${BODY_ERROR_PREFIX}

Issue: Unable to determine max_connections
mysql SHOW VARIABLES exit: ${VAR_RC}
mysql SHOW VARIABLES output:\n${VAR_RAW}
Timestamp: $(date)"
        echo "$BODY" >> $MONITORING_LOG
        send_on_status_change "MAXCONN_ERROR" "$BODY"
        MAX_CONNECTIONS=0
    fi

    USAGE_PCT=0
    if [ "$MAX_CONNECTIONS" -gt 0 ]; then
        USAGE_PCT=$(awk -v th="$THREADS" -v max="$MAX_CONNECTIONS" 'BEGIN { if (max>0) printf("%d", (th*100)/max); else print 0 }')
    fi
}

echo "Monitoring started at $(date)" >> $MONITORING_LOG
check_credentials
collect_metrics
METRICS_BODY=$(build_metrics_body "usage alert")

# Determine status and send only on change
if [ "$USAGE_PCT" -ge "$THRESHOLD" ]; then
    send_on_status_change "THRESHOLD" "$METRICS_BODY"
else
    OK_BODY=$(build_metrics_body "back to normal")
    send_on_status_change "OK" "$OK_BODY"
fi

echo "Monitoring finished at $(date)" >> $MONITORING_LOG

exit 0
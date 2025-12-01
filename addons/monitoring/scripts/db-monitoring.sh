#!/bin/bash
PLATFORM_DOMAIN="{PLATFORM_DOMAIN}"
USER_SCRIPT_PATH="{URL}"
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

# trigger sendevent for onCustomNodeEvent flow
function trigger_sendevent(){
    echo $(date) ${HOSTNAME_SHORT} "Trigger onCustomNodeEvent 'executeScript'" | tee -a $MONITORING_LOG
    curl -fsSL --max-time 10 --retry 1 --retry-max-time 15 \
      --location --request POST "${PLATFORM_DOMAIN}1.0/environment/node/rest/sendevent" \
      --data-urlencode "params={'name': 'executeScript'}" >/dev/null 2>&1
}

function get_last_status(){
    [ -f "$STATUS_FILE" ] && cat "$STATUS_FILE" || echo ""
}

function set_status(){
    local status="$1"
    echo "$status" > "$STATUS_FILE"
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
<b>Queries per second avg:</b> $QPS<br/>
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
    local last_status="$(get_last_status)"
    if [ "$new_status" != "$last_status" ]; then
        trigger_sendevent
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
        BODY=$(cat <<EOF
<div style="font-family:monospace">
<b>${BODY_ERROR_PREFIX}</b><br/>
<br/>
<b>Issue:</b> Missing REPLICA_USER or REPLICA_PSWD in environment variables<br/>
<b>Observed values:</b> REPLICA_USER='${REPLICA_USER:-EMPTY}', REPLICA_PSWD='${REPLICA_PSWD:+SET}'<br/>
<b>Action required:</b> Populate both variables in environment variables<br/>
<b>Timestamp:</b> $(date)
</div>
EOF
)
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
        OUT_ESC=$(printf '%s' "$STATUS_RAW" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' | sed ':a;N;$!ba;s/\n/<br\/>/g')
        BODY=$(cat <<EOF
<div style="font-family:monospace">
<b>${BODY_ERROR_PREFIX}</b><br/>
<br/>
<b>Action:</b> mysqladmin status<br/>
<b>Exit code:</b> $RET<br/>
<b>Output:</b> $OUT_ESC<br/>
<b>Timestamp:</b> $(date)
</div>
EOF
)
        echo "$BODY" >> $MONITORING_LOG
        send_on_status_change "STATUS_ERROR" "$BODY"
        echo "Monitoring finished at $(date)" >> $MONITORING_LOG
        exit 1
    fi

    UPTIME=$(echo "$STATUS_RAW" | grep -o 'Uptime: [0-9]\+' | awk '{print $2}')
    THREADS=$(echo "$STATUS_RAW" | grep -o 'Threads: [0-9]\+' | awk '{print $2}')
    QUESTIONS=$(echo "$STATUS_RAW" | grep -o 'Questions: [0-9]\+' | awk '{print $2}')
    SLOW=$(echo "$STATUS_RAW" | grep -o 'Slow queries: [0-9]\+' | awk '{print $3}')
    OPENS=$(echo "$STATUS_RAW" | grep -o 'Opens: [0-9]\+' | awk '{print $2}')
    FLUSHES=$(echo "$STATUS_RAW" | grep -o 'Flush tables: [0-9]\+' | awk '{print $3}')
    OPEN_TABLES=$(echo "$STATUS_RAW" | grep -o 'Open tables: [0-9]\+' | awk '{print $3}')
    QPS=$(echo "$STATUS_RAW" | sed -n 's/.*Queries per second avg: \([0-9.]*\).*/\1/p')

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
        VAR_ESC=$(printf '%s' "$VAR_RAW" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' | sed ':a;N;$!ba;s/\n/<br\/>/g')
        BODY=$(cat <<EOF
<div style="font-family:monospace">
<b>${BODY_ERROR_PREFIX}</b><br/>
<br/>
<b>Issue:</b> Unable to determine max_connections<br/>
<b>mysql SHOW VARIABLES exit:</b> ${VAR_RC}<br/>
<b>mysql SHOW VARIABLES output:</b> ${VAR_ESC}<br/>
<b>Timestamp:</b> $(date)
</div>
EOF
)
        echo "$BODY" >> $MONITORING_LOG
        send_on_status_change "MAXCONN_ERROR" "$BODY"
        MAX_CONNECTIONS=0
    fi

    USAGE_PCT=0
    if [ "$MAX_CONNECTIONS" -gt 0 ]; then
        USAGE_PCT=$(awk -v th="$THREADS" -v max="$MAX_CONNECTIONS" 'BEGIN { if (max>0) printf("%d", (th*100)/max); else print 0 }')
    fi
}

# cron management: add scheduler and adjust interval
function addScheduler(){
    local cron_file="/etc/cron.d/db-monitoring"
    echo "*/10 * * * * root /usr/local/sbin/db-monitoring.sh check >> /var/log/db-monitoring.log 2>&1" > "$cron_file"
    chmod 0644 "$cron_file"
    chown root:root "$cron_file"
    systemctl reload crond
    echo "$(date) ${HOSTNAME_SHORT} Cron installed at $cron_file" >> $MONITORING_LOG
}

function setSchedulerInterval(){
    local INTERVAL=10
    for i in "$@"; do
        case $i in
            --interval=*)
            INTERVAL=${i#*=}
            shift
            shift
            ;;
            *)
            ;;
        esac
    done
    local cron_file="/etc/cron.d/db-monitoring"
    [ -f "$cron_file" ] || addScheduler
    sed -ri "s|^[#]*[^ ]+ +\* +\* +\* +\* +root .*$|*/${INTERVAL} * * * * root /usr/local/sbin/db-monitoring.sh check >> /var/log/db-monitoring.log 2>\&1|" "$cron_file"
    systemctl reload crond
    echo "$(date) ${HOSTNAME_SHORT} Cron interval set to every ${INTERVAL} minutes" >> $MONITORING_LOG
}

function check(){
    echo "Monitoring started at $(date)" >> $MONITORING_LOG
    check_credentials
    collect_metrics
    if [ "$USAGE_PCT" -ge "$THRESHOLD" ]; then
        send_on_status_change "THRESHOLD"
    else
        send_on_status_change "OK"
    fi
    echo "Monitoring finished at $(date)" >> $MONITORING_LOG
}

function sendEmail(){
    local USER_SESSION="$1"
    local USER_EMAIL="$2"
    echo "Send email started at $(date)" >> $MONITORING_LOG
    check_credentials
    collect_metrics
    local status="$(get_last_status)"
    local title="usage alert"
    if [ "$status" = "OK" ]; then
        title="back to normal"
    fi
    local BODY="$(build_metrics_body "$title")"
    sendEmailNotification "$BODY"
    echo "Send email finished at $(date)" >> $MONITORING_LOG
}

case "$1" in
    setSchedulerInterval)
        shift
        setSchedulerInterval "$@"
        ;;
    check)
        check
        ;;
    sendEmail)
        shift
        sendEmail "$@"
        ;;
    *)
        echo "Usage: $0 {setSchedulerInterval --interval=N|check|sendEmail USER_SESSION USER_EMAIL}" | tee -a $MONITORING_LOG
        exit 1
        ;;
esac

exit 0
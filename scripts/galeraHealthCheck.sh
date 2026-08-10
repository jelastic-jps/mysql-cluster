#!/bin/bash

GALERA_CONF="/etc/mysql/conf.d/galera.cnf"
RETRIES=40
INTERVAL=3
WAIT=false

ARGUMENT_LIST=(
    "db-user"
    "db-password"
    "retries"
    "interval"
)

opts=$(getopt \
    --longoptions "$(printf "%s:," "${ARGUMENT_LIST[@]}")wait" \
    --name "$(basename "$0")" \
    --options "" \
    -- "$@"
)
eval set --$opts

while [[ $# -gt 0 ]]; do
    case "$1" in
        --db-user)
            dbUser=$2
            shift 2
            ;;
        --db-password)
            dbPassword=$2
            shift 2
            ;;
        --wait)
            WAIT=true
            shift
            ;;
        --retries)
            RETRIES=$2
            shift 2
            ;;
        --interval)
            INTERVAL=$2
            shift 2
            ;;
        *)
            break
            ;;
    esac
done

if [[ ! -f ${GALERA_CONF} ]]; then
    echo "The Galera configuration file ${GALERA_CONF} was not found."
    exit 0
fi

if [[ -z "${dbUser}" || -z "${dbPassword}" ]]; then
    echo "Database credentials are not set."
    exit 0
fi

node_ready() {
    local ready state status

    mysqladmin -u"${dbUser}" -p"${dbPassword}" ping 2>/dev/null | grep -q "mysqld is alive" || return 1

    ready=$(mysql -u"${dbUser}" -p"${dbPassword}" -Nse "SHOW STATUS LIKE 'wsrep_ready';" 2>/dev/null | awk '{print $2}')
    state=$(mysql -u"${dbUser}" -p"${dbPassword}" -Nse "SHOW STATUS LIKE 'wsrep_local_state';" 2>/dev/null | awk '{print $2}')
    status=$(mysql -u"${dbUser}" -p"${dbPassword}" -Nse "SHOW STATUS LIKE 'wsrep_cluster_status';" 2>/dev/null | awk '{print $2}')

    [[ "${ready}" == "ON" && "${state}" == "4" && "${status}" == "Primary" ]]
}

if ${WAIT}; then
    while [[ ${RETRIES} -gt 0 ]]; do
        if node_ready; then
            echo "true"
            exit 0
        fi
        sleep "${INTERVAL}"
        RETRIES=$((RETRIES - 1))
    done
    echo "Galera node is not ready after restart (wsrep_ready/local_state/cluster_status)"
else
    if node_ready; then
        echo "true"
    else
        echo "Galera node is not ready"
    fi
fi

exit 0

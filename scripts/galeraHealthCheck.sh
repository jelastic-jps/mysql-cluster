#!/bin/bash -e

MYSQL=`which mysql`
GALERA_CONF="/etc/mysql/conf.d/galera.cnf"

ARGUMENT_LIST=(
    "db-user"
    "db-password"
)

opts=$(getopt \
    --longoptions "$(printf "%s:," "${ARGUMENT_LIST[@]}")" \
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
        *)
        break
        ;;
    esac
done

if [[ ! -f ${GALERA_CONF} ]]
then
  echo "The Galera configuration file /etc/mysql/conf.d/galera.cnf was not found.";
  exit 1;
fi

message="Galera cluster size is wrong"
unset mysqlCheck;
mysqlCheck=$(mysqladmin -u${dbUser} -p${dbPassword} ping)
if [[ "${mysqlCheck}" == "mysqld is alive" ]]
then
    retries=20;
    while [ $retries -gt 0 ];
        do
            currentClusterSize=$(mysql -u${dbUser} -p${dbPassword} -Nse "show global status like 'wsrep_cluster_size';" | awk '{print $NF}')
            nodesCountInConf=$(grep wsrep_cluster_address ${GALERA_CONF} |awk -F '/' '{print $3}'| tr ',' ' ' | wc -w)
            if [[  "${currentClusterSize}" == "${nodesCountInConf}" ]]
            then
                message="true";
                break;
            else
                sleep 3;
                let retries=${retries}-1;
            fi
        done
else
        message="Cannot connect to the mysql service.";
fi
echo $message

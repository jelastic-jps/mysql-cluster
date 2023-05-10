#!/bin/bash -e

MYSQL=`which mysql`

ARGUMENT_LIST=(
    "db-user"
    "db-password"
    "cluster-size"
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
        --cluster-size)
            clusterSize=$2
            shift 2
            ;;
    *)
        break
        ;;
    esac
done

message="Galera cluster size is wrong"
unset mysqlCheck;
mysqlCheck=$(mysqladmin -u${dbUser} -p${dbPassword} ping)
if [[ "${mysqlCheck}" == "mysqld is alive" ]]
then
    retries=20;
    while [ $retries -gt 0 ];
        do
            currentClusterSize=$(mysql -u${dbUser} -p${dbPassword} -Nse "show global status like 'wsrep_cluster_size';" | awk '{print $NF}')
            if [[  "${currentClusterSize}" == "${clusterSize}" ]]
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

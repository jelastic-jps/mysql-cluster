#/bin/bash

USER=$1;
USER="jelastic-8981583"
PASS=$2;
PASS="BuG6m4yVNBFS5UjODsa1"
SERVICE_STATUS=0;
GALERA_CLUSTER_SIZE="";
GALERA_CLUSTER_STATUS="";
PRIMARY="Primary";
SECONDARY="Secondary";
BOOTSTRAP_NODE=""
SEQUENCE_NUMBER="";
LOG_FILE = "/var/log/db_recovery.log";
AUTH_ERROR="Authentication check failed. Please specify correct credentials."
SEQUENCE="Sequence number";
GALERA_STATUS="Galera cluster status";
BOOTSTRAP="Bootstrap";
OK="OK";
ERRORS_FOUND_CODE=1;
error_found=0;

writeLog {
    echo $(date) " Paramenter->"$1"; Value->"$2 >> $LOG_FILE;
}

#Mysql service status:
resp=$(mysqladmin -u${USER} -p${PASS} ping 2>&1);

[[ $resp =~ "Access denied" ]] && {
    writeLog "Authentication" $AUTH_ERROR
    echo $AUTH_ERROR;
    exit 2;
} || { writeLog "Authentication" $OK }

[[ $resp =~ "mysqld is alive" ]] && {
    #Login success
    SERVICE_STATUS=0;
    writeLog "Mysql service status" "Service is running";
} || {
    SERVICE_STATUS=1;
    writeLog "Mysql service status" "Service is not running";
    error_found=1;
}


#Galera cluster size:
resp=$(mysql -u${USER} -p${PASS} -e "show global status like 'wsrep_cluster_size';" 2>&1)
[[ $resp == $NODES_LENGTH ]] && {
    #GALERA_CLUSTER_SIZE="All nodes are in the Galera cluster";
    writeLog "Galera cluster size" "All nodes are in the Galera cluster";
} || {
    #GALERA_CLUSTER_SIZE="There are nodes out from the Galera cluster";
    writeLog "Galera cluster size" "There are nodes out from the Galera cluster";
    error_found=1;
}

#Galera cluster status:
resp=$(mysql -u${USER} -p${PASS} -e "show global status like 'wsrep_cluster_status';" 2>&1)
[[ $resp =~ $PRIMARY ]] && {
    GALERA_CLUSTER_STATUS=$PRIMARY;
    writeLog $GALERA_STATUS $PRIMARY;
} || {
    GALERA_CLUSTER_STATUS=$SECONDARY;
    error_found=1;
    writeLog $GALERA_STATUS $SECONDARY;
}


#Bootstrap:
resp=$(grep safe_to_bootstrap /var/lib/mysql/grastate.dat | awk '{print $2}');
[[ $resp == 0 ]] && {
    writeLog $BOOTSTRAP 1;
} || {
    writeLog $BOOTSTRAP 0;
    error_found=1;
}

#Sequence number:
SEQUENCE_NUMBER=$(cat /var/lib/mysql/grastate.dat | grep seqno | awk '{print $2}');
[[ $SEQUENCE_NUMBER == -1 ]] && { writeLog $SEQUENCE $SEQUENCE_NUMBER } || { writeLog $SEQUENCE $SEQUENCE_NUMBER; error_found=1; }


[[ $error_found == 1 ]] && {
    exit $ERRORS_FOUND_CODE;
}
#echo "{ result: 0, SERVICE_STATUS: $SERVICE_STATUS, GALERA_CLUSTER_SIZE: $GALERA_CLUSTER_SIZE, GALERA_CLUSTER_STATUS: $GALERA_CLUSTER_STATUS, BOOTSTRAP_NODE: $BOOTSTRAP_NODE, SEQUENCE_NUMBER: $SEQUENCE_NUMBER}";


#echo '{ "SERVICE_STATUS": "'$SERVICE_STATUS'", "GALERA_CLUSTER_SIZE": "'$GALERA_CLUSTER_SIZE'", "GALERA_CLUSTER_STATUS": "'$GALERA_CLUSTER_STATUS'", "BOOTSTRAP": "'$BOOTSTRAP_NODE'", "SEQUENCE_NUMBER": "'$SEQUENCE_NUMBER'"}';

#!/bin/bash

CONF_FILE="/etc/my.cnf"

DB_MASTER=$1
MYSQL_ADMIN_USER=$2
MYSQL_ADMIN_PASSWORD=$3
DB_REPLICA_USER=$4
DB_REPLICA_PASSWORD=$5

MYSQL=`which mysql`
MYSQLADMIN=`which mysqladmin`
MYSQLREPLICATE=`which mysqlreplicate`

# Set MySQL REPLICATION-MASTER

{ EXTERNAL_IP=$(ip addr show venet0 | awk '/inet / {gsub(/\/.*/,"",$2); print $2}' |  sed -n 2p); INTERNAL_IP=$(ip addr show venet0 | awk '/inet / {gsub(/\/.*/,"",$2); print $2}' |  sed -n 3p); [ -z $INTERNAL_IP ] && INTERNAL_IP=$EXTERNAL_IP ;}

waiting_MYSQL_service() {
        local LOOP_LIMIT=60
                for (( i=0 ; i<${LOOP_LIMIT} ; i++ )); do
                        echo "${i} - alive?..\n"
                        $MYSQLADMIN -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} ping | grep 'mysqld is alive' > /dev/null 2>&1;
                        [ $? == 0 ] && break;
                        sleep 1
    		done
}

waiting_MYSQL_Master_Service() {
        local LOOP_LIMIT=60
                for (( i=0 ; i<${LOOP_LIMIT} ; i++ )); do
                        logPos=$(mysql -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -h ${DB_MASTER}  -e "show master status" -E 2>/dev/null | grep Position | cut -d: -f2 | sed 's/^[ ]*//')
                        echo "$i - logPos - $logPos\n"
                        [ $logPos -ne 0 ] && break;
                        sleep 1
                done
}

set_mysql_variable () {
        local variable=$1
        local new_value=$2
        $MYSQL -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -e "SET GLOBAL $variable=$new_value";
}

waiting_MYSQL_service;

if `hostname | grep -q "${DB_MASTER}\-"`
then
    IS_MASTER=TRUE;
fi

if [ ${IS_MASTER} == TRUE ]; then
	echo "=> Configuring MySQL replicaiton as master ..."
	if [ ! -f /master_repl_set ]; then
    	RAND="$(date +%s | rev | cut -c 1-2)$(echo ${RANDOM})"
		sed -i "/\[mysqld]/a binlog_format = mixed" ${CONF_FILE}
		sed -i "/\[mysqld]/a replicate-wild-ignore-table = mysql.%" ${CONF_FILE}
		sed -i "/\[mysqld]/a replicate-wild-ignore-table = information_schema.%" ${CONF_FILE}
		sed -i "/\[mysqld]/a replicate-wild-ignore-table = performance_schema.%" ${CONF_FILE}
		sed -i "/\[mysqld]/a log-slave-updates" ${CONF_FILE}
		sed -i "/\[mysqld]/a log-bin = mysql-bin" ${CONF_FILE}
		sed -i "s/^server-id.*/server-id = ${RAND}/" ${CONF_FILE}
		/sbin/service mysql restart 2>&1;
		sleep 3
		waiting_MYSQL_service;
		echo "=> Creating a log user ${REPLICATION_USER}:${REPLICATION_PASS}"
        	$MYSQL -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -e "CREATE USER '${REPLICATION_USER}'@'%' IDENTIFIED BY '${REPLICATION_PASS}'"
        	$MYSQL -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -e "GRANT REPLICATION SLAVE ON *.* TO '${REPLICATION_USER}'@'%'"
        	echo "=> Done!"
        	touch /master_repl_set
	else
        	echo "=> MySQL replication master already configured, skip"
	fi
else
# Set MySQL REPLICATION - SLAVE
	echo "=> Configuring MySQL replicaiton as slave ..."
	if [ ! -f /slave_repl_set ]; then
		RAND="$(date +%s | rev | cut -c 1-2)$(echo ${RANDOM})"
		echo "=> Setting master connection info on slave"
		sed -i "s/^server-id.*/server-id = ${RAND}/" ${CONF_FILE}
        set_mysql_variable server_id ${RAND}
		waiting_MYSQL_Master_Service;
		$MYSQLREPLICATE --master=${MYSQL_ADMIN_USER}:${MYSQL_ADMIN_PASSWORD}@${DB_MASTER}:3306 --slave=${MYSQL_ADMIN_USER}:${MYSQL_ADMIN_PASSWORD}@${INTERNAL_IP}:3306 --rpl-user=${DB_REPLICA_USER}:${DB_REPLICA_PASSWORD} --start-from-beginning
		echo "=> Done!"
		touch /slave_repl_set
	else
		echo "=> MySQL replicaiton slave already configured, skip"
	fi
fi

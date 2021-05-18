#!/bin/bash

CONF_FILE="/etc/my.cnf"

DB_MASTER=$1
DB_SLAVE=$2
MYSQL_ADMIN_USER=$3
MYSQL_ADMIN_PASSWORD=$4
DB_REPLICA_USER=$5
DB_REPLICA_PASSWORD=$6

MYSQL=`which mysql`
MYSQLADMIN=`which mysqladmin`
MYSQLREPLICATE=`which mysqlreplicate`

# Set MySQL REPLICATION-PRIMARY

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
	echo "=> Configuring MySQL replicaiton as primary ..."
else
# Set MySQL REPLICATION - SLAVE
	echo "=> Configuring MySQL replicaiton as secondary ..."
	if [ ! -f ~/save_repl_set ]; then
		echo "=> Setting primary connection info on secondary"
		echo "=> Creating a replica user ${REPLICATION_USER}:${REPLICATION_PASS}"
        	$MYSQL -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -h${DB_MASTER} -e "CREATE USER '${DB_REPLICA_USER}'@'%' IDENTIFIED BY '${DB_REPLICA_PASSWORD}'"
        	$MYSQL -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -h${DB_MASTER} -e "GRANT REPLICATION CLIENT,REPLICATION SLAVE ON *.* TO '${DB_REPLICA_USER}'@'%'; FLUSH PRIVILEGES;"
		$MYSQLREPLICATE --master=${MYSQL_ADMIN_USER}:${MYSQL_ADMIN_PASSWORD}@${DB_MASTER}:3306 --slave=${MYSQL_ADMIN_USER}:${MYSQL_ADMIN_PASSWORD}@${DB_SLAVE}:3306 --rpl-user=${DB_REPLICA_USER}:${DB_REPLICA_PASSWORD} --start-from-beginning
		echo "=> Done!"
		touch ~/save_repl_set
	else
		echo "=> MySQL replicaiton secondary already configured, skip"
	fi
fi

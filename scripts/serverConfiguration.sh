#!/bin/bash

CONF_FILE="/etc/my.cnf"

MYSQL_ADMIN_USER=$1
MYSQL_ADMIN_PASSWORD=$2
REPLICATION_USER=$3
REPLICATION_PASS=$4
INCREMENT=$5

MYSQL=`which mysql`
MYSQLADMIN=`which mysqladmin`

waiting_MYSQL_service() {
        local LOOP_LIMIT=60
                for (( i=0 ; i<${LOOP_LIMIT} ; i++ )); do
                        echo "${i} - alive?..\n"
                        $MYSQLADMIN -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} ping | grep 'mysqld is alive' > /dev/null 2>&1;
                        [ $? == 0 ] && break;
                        sleep 1
    		done
}

waiting_MYSQL_service;

echo "=> Configuring MySQL ..."
if [ ! -f /configuration_set ]; then
	RAND="$(date +%s | rev | cut -c 1-2)$(echo ${RANDOM})"
	sed -i "/\[mysqld]/a binlog_format = mixed" ${CONF_FILE}
	sed -i "/\[mysqld]/a replicate-wild-ignore-table = mysql.%" ${CONF_FILE}
	sed -i "/\[mysqld]/a replicate-wild-ignore-table = information_schema.%" ${CONF_FILE}
	sed -i "/\[mysqld]/a replicate-wild-ignore-table = performance_schema.%" ${CONF_FILE}
	sed -i "/\[mysqld]/a log-slave-updates" ${CONF_FILE}
	sed -i "/\[mysqld]/a log-bin = mysql-bin" ${CONF_FILE}
	sed -i "/\[mysqld]/a auto-increment-increment = ${INCREMENT}" ${CONF_FILE}
	sed -i "/\[mysqld]/a auto-increment-offset = 2" ${CONF_FILE}
	sed -i "s/^server-id.*/server-id = ${RAND}/" ${CONF_FILE}
	/sbin/service mysql restart 2>&1;
	sleep 3
	waiting_MYSQL_service;
	echo "=> Creating a log user ${REPLICATION_USER}:${REPLICATION_PASS}"
	$MYSQL -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -e "CREATE USER '${REPLICATION_USER}'@'%' IDENTIFIED BY '${REPLICATION_PASS}'"
	$MYSQL -u${MYSQL_ADMIN_USER} -p${MYSQL_ADMIN_PASSWORD} -e "GRANT REPLICATION SLAVE ON *.* TO '${REPLICATION_USER}'@'%'"
	echo "=> Done!"
	touch /configuration_set
else
		echo "=> MySQL already configured, skip"
fi

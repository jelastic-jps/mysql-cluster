#!/bin/bash

PROXYSQL_USERNAME="admin"
PROXYSQL_PASSWORD="admin"
PROXYSQL_HOSTNAME="127.0.0.1"
PROXYSQL_PORT="6032"
#Timeout exists for instances where mysqld may be hung
TIMEOUT=10

PROXYSQL_CMDLINE="mysql -u$PROXYSQL_USERNAME -p$PROXYSQL_PASSWORD -h $PROXYSQL_HOSTNAME -P $PROXYSQL_PORT -Ne"
MYSQL_USERNAME=$($PROXYSQL_CMDLINE "SELECT username FROM mysql_users")
MYSQL_PASSWORD=$($PROXYSQL_CMDLINE "SELECT password FROM mysql_users")
MYSQL_CMDLINE="timeout $TIMEOUT mysql -u$MYSQL_USERNAME -p$MYSQL_PASSWORD "

$PROXYSQL_CMDLINE "SELECT hostname FROM runtime_mysql_servers WHERE hostgroup_id='1';" | while read server
do
	MEMBER_STATE=$($MYSQL_CMDLINE -h $server -Ne "SELECT MEMBER_STATE FROM performance_schema.replication_group_members;")
	if [ $? -eq 0 ]
 	then
                [ "${MEMBER_STATE}" == "ERROR" ] && $MYSQL_CMDLINE -h $server -Ne "STOP GROUP_REPLICATION; START GROUP_REPLICATION;"
        else
		echo "`date` - Server $server is unavailable" >> /var/log/proxysql_scheduler.log
	fi
done

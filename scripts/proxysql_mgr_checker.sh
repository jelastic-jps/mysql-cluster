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

ALL_COUNTS=$($PROXYSQL_CMDLINE "SELECT count(*) FROM mysql_servers;")
MGR_OFFLINE_COUNTS=$($PROXYSQL_CMDLINE "SELECT count(*) FROM runtime_mysql_servers WHERE hostgroup_id='1';")

[ "${ALL_COUNTS}" == "${MGR_OFFLINE_COUNTS}" ] && MGR_OFFLINE=true || MGR_OFFLINE=false

$PROXYSQL_CMDLINE "SELECT hostname FROM mysql_servers WHERE status<>'OFFLINE_HARD'" | while read server
do
	if [ "${MGR_OFFLINE}" = true ]; then
		$MYSQL_CMDLINE -h $server -e "SET GLOBAL group_replication_bootstrap_group=ON;"
		MGR_OFFLINE=false
	fi
	MEMBER_STATE=$($MYSQL_CMDLINE -h $server -Ne "SELECT MEMBER_STATE FROM performance_schema.replication_group_members;")
	[ "${MEMBER_STATE}" == "OFFLINE" ] && $MYSQL_CMDLINE -h $server -Ne "START GROUP_REPLICATION; SET GLOBAL group_replication_bootstrap_group=OFF;"

done

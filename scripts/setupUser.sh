#!/bin/bash

user=$1
pswd=$2

unset resp;
resp=$(mysql -u$user -p$pswd mysql --execute="SHOW COLUMNS FROM user")
[ -z "$resp" ] && {
	service mysql stop;
	mysqld_safe --skip-grant-tables --user=mysql --pid-file=/var/lib/mysql/mysqld.pid &
	sleep 5	
	cmd="CREATE TEMPORARY TABLE tmptable SELECT * FROM user WHERE User = 'root'; UPDATE tmptable SET User = '$user' WHERE User = 'root'; DELETE FROM user WHERE User = '$user'; INSERT INTO user SELECT * FROM tmptable WHERE User = '$user'; DROP TABLE tmptable;"
	mysql mysql --execute="$cmd"

	version=$(mysql --version|awk '{ print $5 }'|awk -F\, '{ print $1 }')
	
	if (( $(awk 'BEGIN {print ("'$version'" >= "'5.7'")}') )); then
 		cmd="UPDATE user SET authentication_string=PASSWORD('$pswd') WHERE user='$user';";
	else
		cmd="UPDATE user SET password=PASSWORD('$pswd') WHERE user='$user';";
	fi

	mysql mysql --execute="$cmd"
	echo $resp
	rm -f /var/lib/mysql/auto.cnf
	service mysql restart
} || { 
	echo "[Info] User $user has the required access to the database." 
}

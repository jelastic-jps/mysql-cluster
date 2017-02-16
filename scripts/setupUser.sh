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

	version=$(mysql -V | awk '{print $5}')
	major=$(echo $version | cut -d '.' -f1)
	minor=$(echo $version | cut -d '.' -f2)
	[ "$major" -ge 5 -a "$minor" -ge 7 ] && {
		cmd="UPDATE user SET authentication_string=PASSWORD('$pswd') WHERE user='$user';";
	} || {
		cmd="UPDATE user SET password=PASSWORD('$pswd') WHERE user='$user';";
	}

	mysql mysql --execute="$cmd"
	echo $resp
	rm -f /var/lib/mysql/auto.cnf
	service mysql restart
}


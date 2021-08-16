#!/bin/bash

USER=$1
PASSWORD=$2
ADMIN_PASSWORD=`pwgen 10 1`
JEM=`which jem`
MYSQL=`which mysql`
cmd="CREATE USER '$USER'@'localhost' IDENTIFIED BY '$PASSWORD'; CREATE USER '$USER'@'%' IDENTIFIED BY '$PASSWORD'; GRANT ALL PRIVILEGES ON *.* TO '$USER'@'localhost' WITH GRANT OPTION; GRANT ALL PRIVILEGES ON *.* TO '$USER'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;"
unset resp;
resp=$(mysql -u$USER -p$PASSWORD mysql --execute="SHOW COLUMNS FROM user")
[ -z "$resp" ] && {
   encPass=$(echo $ADMIN_PASSWORD | openssl enc -e -a -A -aes-128-cbc -nosalt -pass "pass:TFVhBKDOSBspeSXesw8fElCcOzbJzYed")
   $JEM passwd set -p static:$encPass
   $MYSQL -uroot -p${ADMIN_PASSWORD} --execute="$cmd"
} || {
   echo "[Info] User $user has the required access to the database."
}

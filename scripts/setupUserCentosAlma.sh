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
   openssl_version="$(openssl version | sed -r 's/^OpenSSL[[:blank:]]+([0-9]+)[.][^[:space:]]+[[:blank:]]+.*/\1/')"
   if  (( $openssl_version >= 3 )); then
       openssl_parameters='-aes-256-cbc -pbkdf2 -md sha512 -iter 10000 -salt -S 429488b2f3870b4a -iv dcb9fe5ecb4011cd20114119930aadc3'
       STATIC="static:"
   else
       openssl_parameters='-aes-128-cbc -nosalt -A -nosalt'
       STATIC="static"
   fi
   encPass=$(echo $ADMIN_PASSWORD | openssl enc -e -a $openssl_parameters -pass "pass:TFVhBKDOSBspeSXesw8fElCcOzbJzYed")
   $JEM passwd set -p $STATIC:$encPass
   $MYSQL -uroot -p${ADMIN_PASSWORD} --execute="$cmd"
} || {
   echo "[Info] User $user has the required access to the database."
}

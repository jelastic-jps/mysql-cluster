#!/bin/bash

SUCCESS_CODE=0
FAIL_CODE=99
RUN_LOG=/tmp/primary.log

log(){
  local message=$1
  local timestamp
  timestamp=`date "+%Y-%m-%d %H:%M:%S"`
  echo -e "[${timestamp}]: ${message}" >> ${RUN_LOG}
}

proxyCommandExec(){
  local command="$1"
  MYSQL_PWD=admin mysql -uadmin -h127.0.0.1 -P6032 -BNe "$command"
}

loadToRuntime(){
  local group="$1"
}

status(){
  local cmd="select status from runtime_mysql_servers where hostgroup_id=10;"
  local status=$(proxyCommandExec "${cmd}")
  if [[ "x$status" != "xONLINE" ]]; then
    log "Primary node status is OFFLINE"
    echo OFFLINE
  else
    echo ONLINE
  fi
}

case ${1} in
    status)
      status
      ;;

    newPrimary)
      newPrimary "$@"
      ;;

    *)
      echo "Please use $(basename "$BASH_SOURCE") status or $(basename "$BASH_SOURCE") newPrimary"
esac

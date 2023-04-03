#!/bin/bash

SUCCESS_CODE=0
FAIL_CODE=99
RUN_LOG=/var/log/jcm.log

WRITE_HG_ID=10
READ_HG_ID=11
MAX_REPL_LAG=20

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

execAction(){
  local action="$1"
  local message="$2"
  stdout=$( { ${action}; } 2>&1 ) && { log "${message}...done";  } || {
    log "${message}...failed\n${stdout}\n";
  }
}

primaryStatus(){
  local cmd="select status from runtime_mysql_servers where hostgroup_id=$WRITE_HG_ID;"
  local status=$(proxyCommandExec "$cmd")
  if [[ "x$status" != "xONLINE" ]]; then
    log "Primary node status is OFFLINE"
    echo OFFLINE
  else
    log "Primary node status is ONLINE"
    echo ONLINE
  fi
}

addNodeToWriteGroup(){
  local nodeId="$1"
  local cmd="INSERT INTO mysql_servers (hostgroup_id, hostname, port) VALUES ($WRITE_HG_ID, '$nodeId', 3306);"
  proxyCommandExec "$cmd"
}

addNodeToReadGroup(){
  local nodeId="$1"
  local cmd="INSERT INTO mysql_servers (hostgroup_id, hostname, port, max_replication_lag) VALUES ($READ_HG_ID, '$nodeId', 3306, '$MAX_REPL_LAG');"
  proxyCommandExec "$cmd"
}

loadServersToRuntime(){
  local cmd="LOAD MYSQL SERVERS TO RUNTIME; SAVE MYSQL SERVERS TO DISK;"
  proxyCommandExec "$cmd"
}

newPrimary(){
  for i in "$@"; do
    case $i in
      --node-id=*)
      NODE_ID=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done

  execAction "addNodeToWriteGroup $NODE_ID" "Adding $NODE_ID to writer hostgroup"
  execAction "addNodeToReadGroup $NODE_ID" "Adding $NODE_ID to reader hostgroup"
  execAction "loadServersToRuntime" "Loading server configuration to runtime"

}

case ${1} in
    primaryStatus)
      primaryStatus
      ;;

    newPrimary)
      newPrimary "$@"
      ;;

    *)
      echo "Please use $(basename "$BASH_SOURCE") primaryStatus or $(basename "$BASH_SOURCE") newPrimary"
esac

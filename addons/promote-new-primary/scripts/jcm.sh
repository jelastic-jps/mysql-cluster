#!/bin/bash

USER_SCRIPT_PATH="https://app.demo.jelastic.com/env-6245726-promote-master?appid=496ed82ef1472ae752954cb1f0ae9c2a&token=Q4khotly89xeLno1NqxXK1klPHy1PLlgNYs23svZ5ImGMW1qbnGH0YGqpH67d4KO"

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

addSchedulerToProxy(){
  local interval_ms="$1"
  local filename="$2"
  local arg1="$3"
  local arg2="$4"
  local arg3="$5"
  local arg4="$6"
  local arg5="$7"
  local cmd="INSERT INTO scheduler(interval_ms,filename,arg1,arg2,arg3,arg4,arg5,active,comment) "
  cmd+="VALUES ($interval_ms,'$filename', '$arg1', '$arg2', '$arg3', '$arg4', '$arg5',1,'jcm task');"
  proxyCommandExec "$cmd"
}

loadSchedulerToRuntime(){
  local cmd="LOAD SCHEDULER TO RUNTIME; SAVE SCHEDULER TO DISK;"
  proxyCommandExec "$cmd"
}


addScheduler(){
  for i in "$@"; do
    case $i in
      --interval=*)
      INTERVAL=${i#*=}
      shift
      shift
      ;;

      --filename=*)
      FILENAME=${i#*=}
      shift
      shift
      ;;

      --arg1=*)
      ARG1=${i#*=}
      shift
      shift
      ;;

      --arg2=*)
      ARG2=${i#*=}
      shift
      shift
      ;;

      --arg3=*)
      ARG3=${i#*=}
      shift
      shift
      ;;

      --arg4=*)
      ARG4=${i#*=}
      shift
      shift
      ;;

      --arg5=*)
      ARG5=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done

  local interval_ms=$((${INTERVAL} * 1000))

  execAction "addSchedulerToProxy $interval_ms $FILENAME $ARG1 $ARG2 $ARG3 $ARG4 $ARG5" "Adding crontask to Scheduler"
  execAction "loadSchedulerToRuntime" "Loading cronjob task to runtime"

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

    addScheduler)
      addScheduler "$@"
      ;;

    *)
      echo "Please use $(basename "$BASH_SOURCE") primaryStatus or $(basename "$BASH_SOURCE") newPrimary"
esac

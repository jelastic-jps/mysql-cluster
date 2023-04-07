#!/bin/bash

USER_SCRIPT_PATH="{URL}"

PROMOTE_NEW_PRIMARY_FLAG="/var/lib/jelastic/promotePrimary"

JCM_CONFIG="/etc/proxysql/jcm.conf"

SUCCESS_CODE=0
FAIL_CODE=99
RUN_LOG=/var/log/jcm.log

WRITE_HG_ID=10
READ_HG_ID=11
MAX_REPL_LAG=20

WGET=$(which wget);

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
  if [[ "x$status" != "xONLINE" ]] && [[ ! -f $PROMOTE_NEW_PRIMARY_FLAG  ]]; then
    log "Primary node status is OFFLINE"
    log "Promoting new Primary"
    resp=$($WGET --no-check-certificate -qO- "${USER_SCRIPT_PATH}");
  else
    if [ ! -f $PROMOTE_NEW_PRIMARY_FLAG  ]; then
      log "Primary node status is ONLINE"
    else
      log "Promoting new Primary"
    fi
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
  cmd+="VALUES ($interval_ms,'$filename', '$arg1', '$arg2', '$arg3', '$arg4', '$arg5',1,'primaryStatus');"
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

deletePrimary(){
  local nodeId="$1"
  local cmd="DELETE from mysql_servers WHERE hostname='$nodeId';"
  proxyCommandExec "$cmd"
}

updatePrimaryInConfig(){
  local nodeId="$1"
  grep -q "PRIMARY_NODE_ID" ${JCM_CONFIG} && { sed -i "s/.*/PRIMARY_NODE_ID=$nodeId/" ${JCM_CONFIG}; } || { echo "PRIMARY_NODE_ID=$nodeId" >> ${JCM_CONFIG}; }
}

newPrimary(){
  for i in "$@"; do
    case $i in
      --server=*)
      SERVER=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done
  if [[ -f $JCM_CONFIG ]]; then
    source $JCM_CONFIG;
    execAction "deletePrimary $PRIMARY_NODE_ID" "Deleting primary node $PRIMARY_NODE_ID from configuration"
    execAction "loadServersToRuntime" "Loading server configuration to runtime"
  fi
  execAction "addNodeToWriteGroup $SERVER" "Adding $SERVER to writer hostgroup"
  execAction "addNodeToReadGroup $SERVER" "Adding $SERVER to reader hostgroup"
  execAction "loadServersToRuntime" "Loading server configuration to runtime"
  execAction "updatePrimaryInConfig $SERVER" "Set primary node to $SERVER in the $JCM_CONFIG"
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

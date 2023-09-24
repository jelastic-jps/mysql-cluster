#!/bin/bash

USER_SCRIPT_PATH="{URL}"

PLATFORM_DOMAIN="{PLATFORM_DOMAIN}"

PROMOTE_NEW_PRIMARY_FLAG="/var/lib/jelastic/promotePrimary"

JCM_CONFIG="/etc/proxysql/jcm.conf"
ITERATION_CONFIG="/tmp/iteration.conf"

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

execResponse(){
  local result=$1
  local message=$2
  local output_json="{\"result\": ${result}, \"out\": \"${message}\"}"
  echo $output_json
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
    error="${message} failed, please check ${RUN_LOG} for details"
    execResponse "$FAIL_CODE" "$error";
    exit 0;
  }
}

execReturn(){
  local action="$1"
  local message="$2"
  stdout=$( { ${action}; } 2>&1 ) && { log "${message}...done";  } || {
    log "${message}...failed\n${stdout}\n";
    error="${message} failed, please check ${RUN_LOG} for details"
    execResponse "$FAIL_CODE" "$error";
    exit 0;
  }
}

primaryStatus(){
  local cmd="select status from runtime_mysql_servers where hostgroup_id=$WRITE_HG_ID;"
  local status=$(proxyCommandExec "$cmd")
  source $JCM_CONFIG;
  source $ITERATION_CONFIG;
  if [[ "x$status" != "xONLINE" ]] && [[ ! -f $PROMOTE_NEW_PRIMARY_FLAG  ]]; then
    if [[ $ITERATION -eq $ONLINE_ITERATIONS ]]; then
      log "Primary node status is OFFLINE"
      log "Promoting new Primary"
      echo "ITERATION=0" > ${ITERATION_CONFIG};
      curl --location --request POST "${PLATFORM_DOMAIN}1.0/environment/node/rest/sendevent" --data-urlencode "params={'name': 'executeScript'}"
    else
      ITERATION=$(($ITERATION+1))
      echo "ITERATION=$ITERATION" > ${ITERATION_CONFIG};
    fi
  else
    if [ ! -f $PROMOTE_NEW_PRIMARY_FLAG  ]; then
      log "Primary node status is ONLINE"
      echo "ITERATION=0" > ${ITERATION_CONFIG};
    else
      log "Promoting new Primary in progress"
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

loadVariablesToRuntime(){
  local cmd="LOAD MYSQL VARIABLES TO RUNTIME; SAVE MYSQL VARIABLES TO DISK;"
  proxyCommandExec "$cmd"
}

addSchedulerProxy(){
  local interval_ms="$1"
  local filename="$2"
  local arg1="$3"
  local comment="$4"
  local cmd="INSERT INTO scheduler(interval_ms,filename,arg1,active,comment) "
  cmd+="VALUES ($interval_ms,'$filename', '$arg1',1,'$comment');"
  proxyCommandExec "$cmd"
}

deleteAllSchedulers(){
  local cmd="DELETE from scheduler;"
  proxyCommandExec "$cmd"
}

updateSchedulerProxy(){
  local interval_ms="$1"
  local comment="$2"
  local cmd="UPDATE scheduler SET interval_ms=$interval_ms WHERE comment='$comment';"
  proxyCommandExec "$cmd"
}

loadSchedulerToRuntime(){
  local cmd="LOAD SCHEDULER TO RUNTIME; SAVE SCHEDULER TO DISK;"
  proxyCommandExec "$cmd"
}

setSchedulerTimeout(){
  for i in "$@"; do
    case $i in
      --interval=*)
      INTERVAL=${i#*=}
      shift
      shift
      ;;

      --scheduler_name=*)
      SCHEDULER_NAME=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done


  local interval_ms=5000
  local interval_sec=5
  local online_iterations=$((${INTERVAL}/${interval_sec}))

  execAction "updateParameterInConfig ONLINE_ITERATIONS $online_iterations" "Set $online_iterations iterations checks in the $JCM_CONFIG"
  execAction "loadSchedulerToRuntime" "Loading cronjob tasks to runtime"
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

      --scheduler_name=*)
      SCHEDULER_NAME=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done

  local interval_ms=5000
  local interval_sec=5
  local online_iterations=$((${INTERVAL}/${interval_sec}))

  execAction "deleteAllSchedulers" "Delete Schedulers"
  execAction "loadSchedulerToRuntime" "Loading cronjob tasks to runtime"
  execAction "updateParameterInConfig ONLINE_ITERATIONS $online_iterations" "Set $online_iterations iterations checks in the $JCM_CONFIG"
  execAction "addSchedulerProxy $interval_ms $FILENAME $ARG1 $SCHEDULER_NAME" "Adding $SCHEDULER_NAME crontask to scheduler"
  execAction "loadSchedulerToRuntime" "Loading cronjob tasks to runtime"

}

deletePrimary(){
  local nodeId="$1"
  local cmd="DELETE from mysql_servers WHERE hostname='$nodeId';"
  proxyCommandExec "$cmd"
}

updateParameterInConfig(){
  local parameter="$1"
  local value="$2"
  grep -q "$parameter" ${JCM_CONFIG} && { sed -i "s/${parameter}.*/$parameter=$value/" ${JCM_CONFIG}; } || { echo "$parameter=$value" >> ${JCM_CONFIG}; }
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
#  execAction "addNodeToReadGroup $SERVER" "Adding $SERVER to reader hostgroup"
  execAction "loadServersToRuntime" "Loading server configuration to runtime"
  execAction "updateParameterInConfig PRIMARY_NODE_ID $SERVER" "Set primary node to $SERVER in the $JCM_CONFIG"
}

getGlobalVariables(){

  local cmd="SELECT variable_name from global_variables WHERE variable_name LIKE 'mysql-%' and variable_value <> '' AND variable_value IS NOT NULL;"
  local global_variables=$(proxyCommandExec "$cmd")
  local json_variables=$(jq -n '[]')
  variables=($global_variables)
  for variable in "${variables[@]}"
  do
    get_value_cmd="SELECT variable_value from global_variables WHERE variable_name='$variable';"
    variable_value=$(proxyCommandExec "$get_value_cmd")
         json_variables=$(echo $json_variables | jq \
        --arg variable_name "$variable" \
        --arg variable_value "$variable_value" \
        '. += [{"variable_name": $variable_name, "variable_value": $variable_value}]')
  done
  echo $json_variables
}

setGlobalVariable(){
  for i in "$@"; do
    case $i in
      --variable-name=*)
      VARIABLE_NAME=${i#*=}
      shift
      shift
      ;;
      --variable-value=*)
      VARIABLE_VALUE=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done

  _set_global_variable(){
    local variable="$1"
    local value="$2"
    local cmd="UPDATE global_variables SET variable_value='$value' WHERE variable_name='$variable';"
    proxyCommandExec "$cmd"
  }
  execAction "_set_global_variable $VARIABLE_NAME $VARIABLE_VALUE" "Set global variable ${VARIABLE_NAME}=${VARIABLE_VALUE}"
  execAction "loadVariablesToRuntime" "Loading global variables to runtime"
}

getWeight(){
 for i in "$@"; do
    case $i in
      --node=*)
      NODE=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done

  local cmd="SELECT weight from mysql_servers where hostname = '$NODE';"
  local weight=$(proxyCommandExec "$cmd")
  echo $weight
}

setWeight(){
  for i in "$@"; do
    case $i in
      --node=*)
      NODE=${i#*=}
      shift
      shift
      ;;
      --weight=*)
      WEIGHT=${i#*=}
      shift
      shift
      ;;
      *)
        ;;
    esac
  done

 _set_weight(){
    local node="$1"
    local weight="$2"
    local cmd="UPDATE mysql_servers SET weight=$weight WHERE hostname='$node';"
    proxyCommandExec "$cmd"
  }
  execAction "_set_weight $NODE $WEIGHT" "Set weight $WEIGHT for $NODE node"
  execAction "loadServersToRuntime" "Loading mysql servers to runtime"
}

forceFailover(){
  curl --location --request POST "${PLATFORM_DOMAIN}1.0/environment/node/rest/sendevent" --data-urlencode "params={'name': 'executeScript'}"
}

case ${1} in

    forceFailover)
      forceFailover
      ;;

    primaryStatus)
      primaryStatus
      ;;

    newPrimary)
      newPrimary "$@"
      ;;

    addScheduler)
      addScheduler "$@"
      ;;

    setSchedulerTimeout)
      setSchedulerTimeout "$@"
      ;;

    updateParameterInConfig)
      updateParameterInConfig "$@"
      ;;

    getGlobalVariables)
      getGlobalVariables
      ;;

    setGlobalVariable)
      setGlobalVariable "$@"
      ;;

    getWeight)
      getWeight "$@"
      ;;
      
    setWeight)
      setWeight "$@"
      ;;

    *)
      echo "Please use $(basename "$BASH_SOURCE") primaryStatus or $(basename "$BASH_SOURCE") newPrimary"
esac

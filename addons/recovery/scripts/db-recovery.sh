#!/bin/bash

POSITIONAL=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    --mysql-user)
    MYSQL_USER=$2
    shift
    shift
    ;;
    --mysql-password)
    MYSQL_PASSWORD=$2
    shift
    shift
    ;;
    --donor-ip)
    DONOR_IP=$2
    shift
    shift
    ;;
    --replica-password)
    REPLICA_PASSWORD=$2
    shift
    shift
    ;;
    --scenario)
    SCENARIO=$2
    shift
    shift
    ;;
    --diagnostic)
    diagnostic=YES
    shift
    ;;
    *)    # unknown option
    POSITIONAL+=("$1") # save it in an array for later
    shift # past argument
    ;;
esac
done
set -- "${POSITIONAL[@]}" # restore positional parameters

usage() {
SCRIPTNAME=$(basename "$BASH_SOURCE")
echo "    USAGE:"
echo "        COMMAND RUN:  "
echo "             $SCRIPTNAME --mysql-user 'MYSQL USER NAME' --mysql-password 'MYSQL USER PASSWORD' --replica-password 'PASSWORD FOR SET' --donor-ip 'MYSQL MASTER IP ADDRESS' --scenario [SCENARIO NAME]"
echo "             Example Restore Run: $SCRIPTNAME --mysql-user 'jelastic-12445' --mysql-password 'password123' --replica-password 'replica123' --donor-ip '192.168.0.1' --scenario restore_master_from_master"
echo "             Example Diagnostic Run: $SCRIPTNAME --mysql-user 'jelastic-12445' --mysql-password 'password123' --diagnostic"
echo "        ARGUMENTS:    "
echo "              --mysql-user - MySQL user with LOCK TABLES priveleges"
echo "              --mysql-password - MySQL user password"
echo "              --replica-password - MySQL replica user password which will be set during recovery"
echo "              --donor-ip - Operable MySQL server ip address from which will be restored failed node."
echo "                           In case of galera recover, need to specify 'galera' as value"
echo "              --scenario - restoration scenario supported arguments:"
echo "                           restore_master_from_master - restore failed master node from another master"
echo "                           restore_slave_from_master - restore slave node from master"
echo "                           restore_master_from_slave - restore master node from slave"
echo "                           restore_galera - restore galera cluster"
echo "              --diagnostic - Run only node diagnostic"
echo "        NOTICE:"
echo "              - Scenarios restore_master_from_master, restore_slave_from_master, restore_master_from_slave should be run from node which should be restored."
echo "                As example in topology master slave we run script in diagnostic mode and it return result that slave replication is broken."
echo "                We run restoration scenario from slave node and set parameter --donor-ip with mysql master node ip"
echo "              - For galera scenario there are no restrictions, restoration can be executed from any node."
echo
}

if [ -z "$MYSQL_USER" ] || [ -z "$MYSQL_PASSWORD" ]; then
  echo "Not all arguments passed!"
  usage
  exit 1;
fi

if [[ "${diagnostic}" != "YES" ]]; then
  if [ -z "${DONOR_IP}" ] || [ -z "${REPLICA_PASSWORD}" ] || [ -z "${SCENARIO}" ]; then
      echo "Not all arguments passed!"
      usage
      exit 1;
  fi
fi


RUN_LOG="/var/log/db_recovery.log"
PRIVATE_KEY='/root/.ssh/id_rsa_db_monitoring'
SSH="timeout 300 ssh -i ${PRIVATE_KEY} -T -o StrictHostKeyChecking=no"
MASTER_CONF='/etc/mysql/conf.d/master.cnf'
SLAVE_CONF='/etc/mysql/conf.d/slave.cnf'
GALERA_CONF='/etc/mysql/conf.d/galera.cnf'
REPLICATION_INFO='/var/lib/mysql/master-position.info'

SUCCESS_CODE=0
FAIL_CODE=99
AUTHORIZATION_ERROR_CODE=701
NODE_ADDRESS=$(ifconfig | grep 'inet' | awk '{ print $2 }' |grep -E '^(192\.168|10\.|172\.1[6789]\.|172\.2[0-9]\.|172\.3[01]\.)')


mysqlCommandExec(){
  command="$1"
  server_ip=$2
  MYSQL_PWD=${MYSQL_PASSWORD} mysql -u${MYSQL_USER} -h${server_ip} -e "$command"
}


log(){
  local message="$1"
  local timestamp
  timestamp=`date "+%Y-%m-%d %H:%M:%S"`
  echo -e "[${timestamp}]: ${message}" >> ${RUN_LOG}
}


cleanSyncData(){
  local mysql_src_ip=$1
  rsync -e "ssh -i ${PRIVATE_KEY} -o StrictHostKeyChecking=no" -Sa \
    --progress \
    --delete  \
    --exclude=auto.cnf \
    --exclude=mysqld.pid \
    --exclude=mysql.sock \
    root@${mysql_src_ip}:/var/lib/mysql/ /var/lib/mysql/
}


resyncData(){
  local mysql_src_ip=$1
  rsync -e "ssh -i ${PRIVATE_KEY} -o StrictHostKeyChecking=no" -Sa \
    --progress \
    --exclude=auto.cnf \
    --exclude=mysqld.pid \
    --exclude=mysql.sock \
    root@${mysql_src_ip}:/var/lib/mysql/ /var/lib/mysql/
}


getNodeType(){
  [[ -f ${MASTER_CONF} ]] && { echo "master"; return ${SUCCESS_CODE}; }
  [[ -f ${SLAVE_CONF} ]] && { echo "slave"; return ${SUCCESS_CODE}; }
  [[ -f ${GALERA_CONF} ]] && { echo "galera"; return ${SUCCESS_CODE}; }
  echo "undefined"
  return ${FAIL_CODE}
}


checkAuth(){
  local cluster_hosts

  cluster_hosts=$(host sqldb |awk -F 'has address' '{print $2}'|xargs)
  for host in ${cluster_hosts}
  do
    check_count=$((check_count+1))
    stderr=$( { mysqlCommandExec "exit" "${host}"; } 2>&1 ) && return ${SUCCESS_CODE}
    [[ x"$(echo ${stderr}| grep 'ERROR 1045')" != x ]] && { echo ${stderr}; return ${FAIL_CODE}; }
  done
  log "[Authentication check]: There are no hosts with running MySQL, can't check. Set check result as OK...done"
  return ${SUCCESS_CODE}
}


execResponse(){
  local result=$1
  local error=$3
  response=$(jq -cn --argjson  result "$result" --arg scenario "${SCENARIO}" --arg address "${NODE_ADDRESS}" --arg error "$error" '{result: $result, scenario: $scenario, address: $address, error: $error}')
  echo "${response}"
}


execSshAction(){
  local action="$1"
  local message="$2"
  local result=${FAIL_CODE}

  action_to_base64=$(echo $action|base64 -w 0)
  stderr=$( { sh -c "$(echo ${action_to_base64}|base64 -d)"; } 2>&1 ) && { log "${message}...done"; } || {
    error="${message} failed, please check ${RUN_LOG} for details"
    execResponse "${result}" "${error}"
    log "${message}...failed\n==============ERROR==================\n${stderr}\n============END ERROR================";
    exit 0
  }
}


execSshReturn(){
  local action="$1"
  local message="$2"
  local result=${FAIL_CODE}

  action_to_base64=$(echo $action|base64 -w 0)
  stdout=$( { sh -c "$(echo ${action_to_base64}|base64 -d)"; } 2>&1 ) && { echo ${stdout}; log "${message}...done"; } || {
    error="${message} failed, please check ${RUN_LOG} for details"
    execResponse "${result}" "${error}"
    log "${message}...failed\n==============ERROR==================\n${stdout}\n============END ERROR================";
    exit 0
  }
}


execAction(){
  local action="$1"
  local message="$2"
  local result=${FAIL_CODE}

  [[ "${action}" == 'checkAuth' ]] && result=${AUTHORIZATION_ERROR_CODE}
  stderr=$( { ${action}; } 2>&1 ) && { log "${message}...done"; } || {
    error="${message} failed, please check ${RUN_LOG} for details"
    execResponse "${result}" "${error}"
    log "${message}...failed\n==============ERROR==================\n${stderr}\n============END ERROR================";
    exit 0
  }
}


setMasterReadonly(){
  local mysql_src_ip=$1
  mysqlCommandExec 'flush tables with read lock;' "${mysql_src_ip}"
}

resetReplicaPassword(){
  local mysql_src_ip=$1
  local replica_user
  replica_user=$(mysqlCommandExec 'select User from mysql.user where User like "repl-%" \G;' ${mysql_src_ip}|grep 'User'|cut -d ':' -f2|sed 's/ //g')

  stderr=$( { MYSQL_PWD=${REPLICA_PASSWORD} mysql -u${replica_user} -h${mysql_src_ip} -e 'exit'; } 2>&1 ) || {
    mysqlCommandExec "ALTER USER '${replica_user}'@'%' IDENTIFIED BY '${REPLICA_PASSWORD}';" "${mysql_src_ip}"
    return ${SUCCESS_CODE}
  }
  log "[Node: ${mysql_src_ip}] Replica password matched...skip"
}



getMasterPosition(){
  local mysql_src_ip=$1
  echo "File=$(mysqlCommandExec 'show master status\G;' ${mysql_src_ip} |grep 'File'|cut -d ':' -f2|sed 's/ //g')" > ${REPLICATION_INFO}
  echo "Position=$(mysqlCommandExec 'show master status\G;' ${mysql_src_ip}|grep 'Position'|cut -d ':' -f2|sed 's/ //g')" >> ${REPLICATION_INFO}
  echo "ReportHost=$(mysqlCommandExec 'show variables like "report_host" \G;' ${mysql_src_ip}|grep 'Value'|cut -d ':' -f2|sed 's/ //g')" >> ${REPLICATION_INFO}
  echo "ReplicaUser=$(mysqlCommandExec 'select User from mysql.user where User like "repl-%" \G;' ${mysql_src_ip}|grep 'User'|cut -d ':' -f2|sed 's/ //g')" >> ${REPLICATION_INFO}
  echo "ReplicaPassword=${REPLICA_PASSWORD}" >> ${REPLICATION_INFO}
}


getSlaveStatus(){
  local node=$1
  local slave_running_values

  slave_running_values=$(mysqlCommandExec "SHOW SLAVE STATUS \G" ${node} |grep -E 'Slave_IO_Running:|Slave_SQL_Running:' |grep -i yes|wc -l)
  if [[ ${slave_running_values} != 2 ]]; then
    echo "failed"
    log "[Node: ${node}] Slave is not running...failed\n ${slave_running_values}"
    return ${FAIL_CODE}
  fi
  echo "ok"
  log "[Node: ${node}] Slave is running...done"
}

removeSlaveFromMaster(){
  local node=$1
  mysqlCommandExec "stop slave; reset slave all;" ${node}
}


getMasterStatus(){
  local node=$1
  local is_master_have_binlog
  local is_master_have_slave
  local status="failed"

  is_master_have_binlog=$(mysqlCommandExec "SHOW MASTER STATUS \G" "${node}" |grep -E 'File|Position'|wc -l)
  is_master_have_slave=$(mysqlCommandExec "SHOW SLAVE STATUS \G" "${node}" |grep -E 'Slave_IO_Running:|Slave_SQL_Running:'|wc -l)
  if [[ ${is_master_have_binlog} == 2 ]] && [[ ${is_master_have_slave} == 0 ]]; then
    echo 'ok'
    log "[Node: ${node}] Master status...ok"
    return ${SUCCESS_CODE}
  elif [[ ${is_master_have_binlog} == 2 ]] && [[ ${is_master_have_slave} == 2 ]]; then
    status=$(getSlaveStatus "${node}")
    echo "${status}"
    return ${SUCCESS_CODE}
  fi
  echo "${status}"
  log "[Node: ${node}] Looks like master not configured, SHOW MASTER STATUS command returned empty result...failed"
}


getGaleraStatus(){
  local node=$1
  local wsrep_cluster_status
  local status='ok'

  wsrep_cluster_status=$(galeraGetClusterStatus "${node}")
  if [[ ${wsrep_cluster_status} != "Primary" ]]; then
    status='failed'
    echo ${status}
    log "Galera node status is ${wsrep_cluster_status}...failed"
    return ${SUCCESS_CODE}
  fi
  echo ${status}
  log "[Node: ${node}] Galera node status is ${wsrep_cluster_status}...ok";
}


setMasterWriteMode(){
  local master_ip=$1
  mysqlCommandExec "unlock tables;" ${master_ip}
}


restoreSlavePosition(){
  local slave_ip=$1
  source ${REPLICATION_INFO};
  rm -f ${REPLICATION_INFO}
  mysqlCommandExec "STOP SLAVE; CHANGE MASTER TO MASTER_HOST='${ReportHost}', MASTER_USER='${ReplicaUser}', MASTER_PASSWORD='${REPLICA_PASSWORD}', MASTER_LOG_FILE='${File}', MASTER_LOG_POS=${Position}; START SLAVE;" ${slave_ip}
}


checkMysqlServiceStatus(){
  local node=$1
  stderr=$( { timeout 20 mysqladmin -u${MYSQL_USER} -p${MYSQL_PASSWORD} -h ${node} status; } 2>&1 ) || {
    log "[Node: ${node}] MySQL Service down...failed\n==============ERROR==================\n${stderr}\n============END ERROR================";
    echo "down"
    return ${FAIL_CODE}
  }
  log "[Node: ${node}] MySQL Service up...ok"
  echo "up"
}


galeraCheckClusterSize(){
  local nodes_count_in_conf
  local nodes_count_status

  nodes_count_in_conf=$(grep wsrep_cluster_address ${GALERA_CONF} |awk -F '/' '{print $3}'| tr ',' ' ' | wc -w)
  [[ "${nodes_count_in_conf}" == "0" ]] && { echo 'failed'; log "Can't detect galera hosts in ${GALERA_CONF}"; return ${FAIL_CODE}; }
  nodes_count_status=$(mysqlCommandExec "show global status like 'wsrep_cluster_size'\G;" localhost|grep -i value|awk -F ':' '{print $2}'|xargs)
  if [[ "${nodes_count_in_conf}" != "${nodes_count_status}" ]]; then
    echo "failed"
    log "[Node: localhost] Galera cluster size check failed, wsrep_cluster_size=${nodes_count_status}, that is lower then physical nodes count: ${nodes_count_in_conf}...failed"
    return ${SUCCESS_CODE}
  fi
  echo "ok"
  log "[Node: localhost] Galera cluster size...ok"
}


stopMysqlService(){
  local node=$1

  local command="${SSH} ${node} \"/usr/bin/jem service stop\""
  local message="[Node: ${node}] Stop MySQL service"
  execSshAction "$command" "$message" || return ${FAIL_CODE}

  command="${SSH} ${node} \"pkill 'mariadb|mysql|mysqld'\"|| exit 0"
  message="[Node: ${node}] Detect and kill non closed mysql process"
  execSshAction "$command" "$message"
}


startMysqlService(){
  local node=$1
  local command="${SSH} ${node} \"/usr/bin/jem service start\""
  local message="[Node: ${node}] Start MySQL service"
  execSshAction "$command" "$message"
}

checkMysqlOperable(){
  local node=$1
  for retry in $(seq 1 10)
  do
    stderr=$( { mysqlCommandExec "exit" "${node}"; } 2>&1 ) && return ${SUCCESS_CODE}
    log "[Node: ${node}] [Retry: ${retry}/10] MySQL service operable check...waiting"
    sleep 5
  done
  echo -e ${stderr}
  return ${FAIL_CODE}
}

galeraSetBootstrap(){
  local node=$1
  local num=$2
  local command="${SSH} ${node} \"sed -i 's/safe_to_bootstrap*/safe_to_bootstrap: ${num}/g' /var/lib/mysql/grastate.dat\""
  local message="[Node: ${node}] Set safe_to_bootstrap: ${num}"
  execSshAction "$command" "$message"
}


galeraFixWithActivePrimary(){
  local nodes_to_fix=("$@")
  for node in "${nodes_to_fix[@]}"
  do
      stopMysqlService "${node}"
      galeraSetBootstrap "${node}" 0
      startMysqlService "${node}"
  done
}


galeraGetClusterStatus(){
  local node=$1
  local wsrep_cluster_status='undefined'

  service_status=$(checkMysqlServiceStatus "${node}")
  if [[ ${service_status} == "up" ]]; then
    wsrep_cluster_status=$(mysqlCommandExec "show global status like 'wsrep_cluster_status'\G;" "${node}" |grep -i value|awk -F ':' '{print $2}'|xargs)
    log "[Node: ${node}] wsrep_cluster_status=${wsrep_cluster_status}"
  else
    log "[Node: ${node}] Can't define wsrep_cluster_status, mysql service is down"
  fi

  echo "${wsrep_cluster_status}"
}


galeraGetPrimaryNode(){
  local nodes_to_fix=("$@")
  local seq_num=0
  local master_node='undefined'
  local master_node_by_seq

  for node in "${nodes_to_fix[@]}"
  do
      command="${SSH} ${node} 'grep safe_to_bootstrap /var/lib/mysql/grastate.dat'"
      safe_bootstrap=$(execSshReturn "$command" "[Node: ${node}] Get safe_to_bootstrap"|awk -F : '{print $2}'|xargs )
      log "[Node: ${node}] safe_to_bootstrap=${safe_bootstrap}"
      if [[ ${safe_bootstrap} == 1 ]]; then
        master_node="${node}"
        stopMysqlService "${node}"
      else
        stopMysqlService "${node}"
        [[ ${master_node} == 'undefined' ]] || continue
        command="${SSH} ${node} 'mysqld --wsrep-recover > /dev/null 2>&1 && tail -2 /var/log/mysql/mysqld.log |grep \"Recovered position\"'"
        cur_seq_num=$(execSshReturn "$command" "[Node: ${node}] Get seqno"|awk -F 'Recovered position:' '{print $2}'|awk -F : '{print $2}' )
        log "[Node: ${node}] seqno=${cur_seq_num}"
      fi

      if [ "${seq_num}" -lt "${cur_seq_num}" ]; then
        master_node_by_seq=${node}
        seq_num=${cur_seq_num}
      fi
  done

  [[ ${master_node} == 'undefined' ]] && master_node=${master_node_by_seq}
  log "[Node: ${master_node}] Set as primary...done"
  echo "${master_node}"
}


galeraFix(){
  local list_nodes=''
  local primary_nodes=()
  local nodes_to_fix=()
  local master_node

  list_nodes=$(grep wsrep_cluster_address ${GALERA_CONF} |awk -F '/' '{print $3}'|xargs -d ',')
  [[ -z "${list_nodes}" ]] && { log "Can't detect galera hosts in ${GALERA_CONF}"; return ${FAIL_CODE}; }
  for node in ${list_nodes}; do
    wsrep_cluster_status=$(galeraGetClusterStatus ${node})
    [[ ${wsrep_cluster_status} == "Primary" ]] && primary_nodes+=("${node}") || nodes_to_fix+=("${node}")
  done

  if [[ ${#primary_nodes[@]} == 0 ]]; then
    master_node=$(galeraGetPrimaryNode "${nodes_to_fix[@]}")
    galeraSetBootstrap "${master_node}" 1
    startMysqlService ${master_node}
    galeraFixWithActivePrimary ${nodes_to_fix[@]/$master_node}
  else
    galeraFixWithActivePrimary ${nodes_to_fix[@]}
  fi
}

diagnosticResponse(){
  local result=$1
  local node_type=$2
  local service_status=$3
  local status=$4
  local galera_size_status=$5
  local error=$6
  response=$( jq -cn \
                  --argjson  result "$result" \
                  --arg node_type "$node_type" \
                  --arg address "${NODE_ADDRESS}" \
                  --arg service_status "$service_status" \
                  --arg status "$status" \
                  --arg galera_size "$galera_size_status" \
                  --arg error "$error" \
                  '{result: $result, node_type: $node_type, address: $address, service_status: $service_status, status: $status, galera_size: $galera_size, error: $error}' )
  echo "${response}"
}

nodeDiagnostic(){
  local node_type=''
  local service_status=''
  local status='failed'
  local galera_size_status=''
  local result=0
  local error=''

  node_type=$(getNodeType) || {
    error='Current node does not have master.cnf,slave.cnf or galera.cnf'
    result=${FAIL_CODE}
    diagnosticResponse "$result" "$node_type" "$service_status" "$status" "$galera_size_status" "$error"
    log "${error}"
    return ${SUCCESS_CODE}
  }
  log "[Node: localhost] Detected node type: ${node_type}...done"


  service_status=$(checkMysqlServiceStatus 'localhost') || {
      diagnosticResponse "$result" "$node_type" "$service_status" "$status" "$galera_size_status" "$error"
      return ${SUCCESS_CODE};
  }

  if [[ "${node_type}" == "slave" ]] && [[ "${service_status}" == "up" ]]; then
    status=$(getSlaveStatus "localhost")
  elif [[ "${node_type}" == "master" ]] && [[ "${service_status}" == "up" ]]; then
    status=$(getMasterStatus "localhost")
  elif [[ "${node_type}" == "galera" ]] && [[ "${service_status}" == "up" ]]; then
    galera_size_status=$(galeraCheckClusterSize) || { result=${FAIL_CODE}; error="Can't detect galera hosts in ${GALERA_CONF}"; }
    status=$(getGaleraStatus "localhost")
  fi
  diagnosticResponse "$result" "$node_type" "$service_status" "$status" "$galera_size_status" "$error"
}

restore_slave_from_master(){
  execAction "checkAuth" 'Authentication check'
  stopMysqlService "localhost"
  execAction "resetReplicaPassword ${DONOR_IP}" "[Node: ${DONOR_IP}] Reset replica user password"
  execAction "cleanSyncData ${DONOR_IP}" "[Node: localhost] Sync data from donor ${DONOR_IP} with delete flag"
  execAction "setMasterReadonly ${DONOR_IP}" "[Node: ${DONOR_IP}] Set master readonly"
  execAction "resyncData ${DONOR_IP}" "[Node: localhost] Resync data after donor ${DONOR_IP} lock"
  execAction "getMasterPosition ${DONOR_IP}" "[Node: ${DONOR_IP}] Get master possition"
  execAction "setMasterWriteMode ${DONOR_IP}" "[Node: ${DONOR_IP}] Set donor to read write mode"
  startMysqlService "localhost"
  execAction "checkMysqlOperable localhost" "[Node: localhost] Mysql service operable check"
  execAction 'restoreSlavePosition localhost' '[Node: localhost] Restore master position on self node'
}

restore_master_from_slave(){
  execAction "checkAuth" 'Authentication check'
  stopMysqlService "localhost"
  execAction "resetReplicaPassword ${DONOR_IP}"
  execAction "cleanSyncData ${DONOR_IP}" "[Node: localhost] Sync data from donor ${DONOR_IP} with delete flag"
  stopMysqlService "${DONOR_IP}"
  execAction "resyncData ${DONOR_IP}" "[Node: localhost] Resync data after donor ${DONOR_IP} service stop"
  startMysqlService "localhost"
  execAction "checkMysqlOperable localhost" "[Node: localhost] Mysql service operable check"
  startMysqlService "${DONOR_IP}"
  execAction "checkMysqlOperable ${DONOR_IP}" "[Node: ${DONOR_IP}] Mysql service operable check"
  execAction "getMasterPosition localhost" '[Node: localhost] Get master possition'
  execAction "removeSlaveFromMaster localhost" '[Node: localhost] Disable slave'
  execAction "restoreSlavePosition ${DONOR_IP}" "[Node: ${DONOR_IP}] Restore master position on donor"
}

restore_master_from_master(){
  restore_slave_from_master
  execAction "getMasterPosition localhost" '[Node: localhost] Get self master possition'
  execAction "restoreSlavePosition ${DONOR_IP}" "[Node: ${DONOR_IP}] Restore master position on donor"
}

restore_galera(){
  execAction 'checkAuth' 'Authentication check'
  galeraFix
}

if [[ "${diagnostic}" == "YES" ]]; then
  log ">>>BEGIN DIAGNOSTIC"
  execAction "checkAuth" 'Authentication check'
  nodeDiagnostic
  log ">>>END DIAGNOSTIC"
else
  log ">>>BEGIN RESTORE SCENARIO [${SCENARIO}]"
  $SCENARIO
  nodeDiagnostic
  log ">>>END RESTORE SCENARIO [${SCENARIO}]"
fi

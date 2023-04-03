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

execAction(){
  local action="$1"
  local message="$2"
  stdout=$( { ${action}; } 2>&1 ) && { log "${message}...done";  } || {
    log "${message}...failed\n${stdout}\n";
  }
}

execReturn(){
  local action="$1"
  local message="$2"
  stdout=$( { ${action}; } 2>&1 ) && { log "${message}...done"; echo ${stdout}; } || {
    log "${message}...failed\n${stdout}\n";
  }
}

proxyCommandExec(){
  local command="$1"
  mysql -uadmin -padmin -h127.0.0.1 -e "$command"
}

loadToRuntime(){
  local group="$1"
}


status (){
  


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

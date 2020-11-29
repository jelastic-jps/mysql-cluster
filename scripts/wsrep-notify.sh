#!/bin/sh -eu
currentDate=`date +"%Y-%m-%d %T"`
from="GaleraMonitoring"
sendmail=`which sendmail`
node=`hostname`
LOG="/var/log/mysql/wsrep-notify.log"

while [ $# -gt 0 ]
do
   case $1 in
      --status)
         STATUS=$2
         shift
         ;;
      --uuid)
         CLUSTER_UUID=$2
         shift
         ;;
      --primary)
         PRIMARY=$2
         shift
         ;;
      --index)
         INDEX=$2
         shift
         ;;
      --members)
         MEMBERS=$2
         shift
         ;;
         esac
         shift
   done

echo "$currentDate $node is $STATUS: PRIMARY:$PRIMARY INDEX:$INDEX MEMBERS:$MEMBERS" >> $LOG;

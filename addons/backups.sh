#!/bin/bash
#  Script for backup mysql databases
#
# ---------------------------------------------------------------------------------------------
# Copyright (c) 2011 Hivext Technologies

USER='jelastic-5790456'
PASSWORD='RzcujH7o6cydGHgjJxp3'
HOST='localhost'
BACKUPDIR='/tmp/backups'
DOWEEKLY=1
SOCKET='/var/lib/mysql/mysql.sock'
EXCLUDE=('information_schema')

#---------------------------
MYSQL=`which mysql`
MDUMP=`which mysqldump`
#---------------------------
OPTS="--quote-names --opt --databases --compress"
DATE=`date +%Y-%m-%d_%Hh%Mm`
MONTH=`date +%B`
DAYNAME=`date +%A`
MDAYNUM=`date +%d`
DNOW=`date +%u`
DATE=`date +%Y-%m-%d_%Hh%Mm`

db_dump () {
    local db_name=$1
    local file_name=$2
    ${MDUMP} --user=${USER} --password=${PASSWORD} --host=${HOST} ${OPTS} ${db_name} > ${file_name}
    return $?
}

get_databases() {
    local tables
    local tbl
    tables=`${MYSQL} --user=${USER} --password=${PASSWORD} --host=${HOST} --batch --skip-column-names -e "show databases" | sed 's/ /%/g'`
    for i in $(seq 0 $((${#EXCLUDE[@]} - 1))) ; do
        tables=`echo ${tables} | sed "s/\b${EXCLUDE[$i]}\b//g"`
    done
    DBS=(`echo ${tables}`)
}

create_directories() {
    if [ ! -e "${BACKUPDIR}" ]; then mkdir -p "${BACKUPDIR}"; fi
    if [ ! -e "${BACKUPDIR}/daily" ]; then mkdir -p "${BACKUPDIR}/daily"; fi
    if [ ! -e "${BACKUPDIR}/weekly" ]; then mkdir -p "${BACKUPDIR}/weekly"; fi
    if [ ! -e "${BACKUPDIR}/monthly" ]; then mkdir -p "${BACKUPDIR}/monthly"; fi

    if [ "${LATEST}" = "yes" ]; then
        if [ ! -e "${BACKUPDIR}/latest" ]; then mkdir -p "${BACKUPDIR}/latest"; fi
        rm -fv "${BACKUPDIR}/latest/*"
    fi
}

create_directories

if [ "${HOST}" = "localhost" ]; then
    if [ "${SOCKET}" ]; then OPT="${OPT} --socket=${SOCKET}"; fi
fi

get_databases

#monthly rotation
if [ ${MDAYNUM} = "01" ]; then
    for DB in ${DBS} ; do
        if [ ! -e "${BACKUPDIR}/monthly/${DB}" ]; then mkdir -p "${BACKUPDIR}/monthly/${DB}"; fi

        db_dump "${DB}" "${BACKUPDIR}/monthly/${DB}/${DB}_${DATE}.${MONTH}.${DB}.sql"
        [ $? -eq 0 ] && {
            # half year rotation
            find "${BACKUPDIR}/monthly/${DB}" -mtime +180 -type f -exec rm -v {} \;
        }
    done
fi

#daily rotation
for i in $(seq 0 $((${#DBS[@]} - 1))); do
    DB=${DBS[$i]}
    echo "Backuping ${DB}"
    if [ ! -e "${BACKUPDIR}/daily/${DB}" ]; then mkdir -p "${BACKUPDIR}/daily/${DB}"; s3cmd mb s3://${hostname}; fi
    if [ ! -e "${BACKUPDIR}/weekly/${DB}" ]; then mkdir -p "${BACKUPDIR}/weekly/${DB}"; s3cmd mb s3://${hostname}; fi

    # Weekly Backup
    if [ ${DNOW} = ${DOWEEKLY} ]; then
        db_dump "${DB}" "${BACKUPDIR}/weekly/${DB}/${DB}_week.${WEEK}.${DATE}.sql"
	[ $? -eq 0 ] && find "${BACKUPDIR}/weekly/${DB}" -mtime +42 -type f -exec rm -v {} \;

     # Daily Backup
     else
         echo "daily backup"
         db_dump "${DB}" "${BACKUPDIR}/daily/${DB}/${DB}_${DATE}.${DAYNAME}.sql"
	s3cmd put ${BACKUPDIR}/daily/${DB}/${DB}_${DATE}.${DAYNAME}.sql s3://${HOSTNAME}/${DB}_${DATE}.${DAYNAME}.sql
         [ $? -eq 0 ] && find "${BACKUPDIR}/daily/${DB}" -mtime +10 -type f -exec rm -v {} \;
     fi

done

#backupping
s3cmd ls s3://${HOSTNAME}
if [ $? -ne 0 ]; then s3cmd mb s3://${HOSTNAME};fi
tar -czvf .tar.gz ${BACKUPDIR}/daily/${DB}/${DB}_${DATE}.${DAYNAME}.sql

#if s3 then
#s3cmd mb s3://${hostname}
#tar -czvf ${hostname}.tar.gz ${BACKUPDIR}/daily/${DB}/${DB}_${DATE}.${DAYNAME}.sql



#s3cmd put  s3://mysql-backup-jelastic/test.tar.gz

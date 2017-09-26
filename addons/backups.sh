#!/bin/bash
#  Script for backup mysql databases
#
# ---------------------------------------------------------------------------------------------
# Copyright (c) 2017 Hivext Technologies

#. backups.cfg

#USER='jelastic-5790456'
#PASSWORD='RzcujH7o6cydGHgjJxp3'
#HOST='localhost'
#BACKUPDIR='/root/backups'

. .backup.ini


NUMBER_OF_BACKUPS=6
TMP_PATH='/tmp/backups'
S3_BUCKET_NAME=${HOSTNAME}

SOCKET='/var/lib/mysql/mysql.sock'
EXCLUDE=('information_schema')

#---------------------------
MYSQL=`which mysql`
MDUMP=`which mysqldump`
S3CMD=`which s3cmd`
#---------------------------
OPTS="--quote-names --opt --databases --compress"
S3_OPTS="--no-check-hostname"
DATE=`date +%Y-%m-%d_%Hh%Mm%Ss`

DATESTAMP=$(date +".%m.%d.%Y")

db_dump () {
    local db_name=$1
    local file_name=$2
    ${MDUMP} --user=${USER} --password=${PASSWORD} ${OPTS} ${db_name} > ${file_name}
    return $?
}

get_databases() {
    local tables
    local tbl
    tables=`${MYSQL} --user=${USER} --password=${PASSWORD} --batch --skip-column-names -e "show databases" | sed 's/ /%/g'`
    for i in $(seq 0 $((${#EXCLUDE[@]} - 1))) ; do
        tables=`echo ${tables} | sed "s/\b${EXCLUDE[$i]}\b//g"`
    done
    DBS=(`echo ${tables}`)
}

if [ ! -e "${BACKUPDIR}" ]; then mkdir -p "${BACKUPDIR}"; fi

create_S3_bucket() {
	count=`${S3CMD} ls ${S3_OPTS} | grep ${S3_BUCKET_NAME}  | wc -l`
	if [[ $count == 0 ]]; then
		${S3CMD} mb s3://${S3_BUCKET_NAME} ${S3_OPTS}
		echo "New S3 BUCKET ${S3_BUCKET_NAME} has been created....";
	fi
}

get_databases

if [ ! -e "${TMP_PATH}" ]; then mkdir -p "${TMP_PATH}"; fi

for i in $(seq 0 $((${#DBS[@]} - 1))); do
    DB=${DBS[$i]}
    echo "Backuping ${DB}"
    db_dump "${DB}" "${TMP_PATH}/${DB}.sql"
#       [ $? -eq 0 ] && find "${BACKUPDIR}" -mtime +10 -type f -exec rm -v {} \;
done

echo "Done backing up all databases."

echo "Starting compression..."
tar czf ~/${DATE}.tar.gz -C ${TMP_PATH}/ .
echo "Done compressing the backup file."

create_S3_bucket

echo "Uploading the new backup..."
${S3CMD} put ${S3_OPTS} -f ~/${DATE}.tar.gz s3://${S3_BUCKET_NAME}/${DATE}.tar.gz
echo "New backup uploaded."

remove_old_backups_s3() {
	${S3CMD} ${S3_OPTS} ls s3://${S3_BUCKET_NAME} |sort -k1,2 -r|tail -n +${NUMBER_OF_BACKUPS} | awk '{print $4}' | while read -r OLD_BACKUP;
  	do
		if [[ ${OLD_BACKUP} != "" ]];  then ${S3CMD} ${S3_OPTS} del "${OLD_BACKUP}"; fi
		echo "Old Backup ${OLD_BACKUP} has been deleted ....."
	done;
}

remove_old_backups_s3

remove_old_backups() {
	ls -tp | grep -v '/$' | tail -n +3 | xargs -I {} rm -- {}
}

rm -rf ${TMP_PATH}

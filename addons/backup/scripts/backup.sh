#!/bin/bash

BACKUP_CONF=$1

TMP_PATH='/tmp/backups'
S3_BUCKET_NAME=${HOSTNAME}

LOG_FILE="/var/log/backup.log"
SOCKET='/var/lib/mysql/mysql.sock'


if [ ! -f ${BACKUP_CONF} ]
then
    echo "ERROR: Configuration file not found ....." >> ${LOG_FILE}
    exit 1
fi

source ${BACKUP_CONF}
let NUMBER_OF_BACKUPS++

#-----Check server---------

if [ -x "$(command -v psql)" ]; then
  echo "INFO: Determine PostgreSQL server ....." >> ${LOG_FILE};
  SQL=`which psql`
  DUMP=`which pg_dump`
  OPTS=""
  EXCLUDE=('information_schema' 'performance_schema')
  export PGPASSWORD=${DB_PASSWORD}
  DB_DUMP="${DUMP} --username=${DB_USER} ${OPTS}"
  GET_TABLES="`${SQL} -U ${DB_USER} -l -A -F: | sed -ne "/:/ { /Name:Owner/d; /template0/d; s/:.*$//; p }"`"

fi

if [ -x "$(command -v mysql)" ]; then
  echo "INFO: Determine MySQL server ....." >> ${LOG_FILE};
  SQL=`which mysql`
  DUMP=`which mysqldump`
  OPTS="--quote-names --opt --databases --compress"
  EXCLUDE=('information_schema' 'performance_schema')
  DB_DUMP="${DUMP} --user=${DB_USER} --password=${DB_PASSWORD} ${OPTS}"
  GET_TABLES=`${SQL} --user=${DB_USER} --password=${DB_PASSWORD} --batch --skip-column-names -e "show databases" | sed 's/#.*//'|sed 's/ /%/g'`
fi

#---------------------------
MKDIR=`which mkdir`
MOUNT=`which mount`
GREP=`which grep`
#---------------------------

S3_OPTS="--no-check-hostname --config=${S3_CONF}"

DATE=`date +%Y-%m-%d_%Hh:%Mm`

__VERBOSE=1

log() {
     if [ $__VERBOSE -gt 0 ]; then
         echo -n `date +%D.%k:%M:%S.%N` >> ${LOG_FILE}
         echo ": $@" >> ${LOG_FILE}
     fi
     if [ $__VERBOSE -gt 1 ]; then
         echo -n `date +%D.%k:%M:%S.%N`
         echo ": $@"
     fi
}

db_dump () {
    local db_name=$1
    local file_name=$2
    ${DB_DUMP} ${db_name} > ${file_name}
    return $?
}

get_databases() {
    local tables
    local tbl
    tables=${GET_TABLES}
    for i in $(seq 0 $((${#EXCLUDE[@]} - 1))) ; do
        tables=`echo ${tables} | sed "s/\b${EXCLUDE[$i]}\b//g"`
    done
    DBS=(`echo ${tables}`)
}


create_directories() {
    local back_dir=$1
    [ ! -d "$back_dir" ] && {
        $MKDIR -p $back_dir 2>/dev/null;
         [ "$?" -ne 0 ]  && {
             log "Error creating backup_dir. Exiting..";
    #         exit;
         }
     }
}

create_S3_bucket() {
	count=`${S3CMD} ls ${S3_OPTS} | grep ${S3_BUCKET_NAME}  | wc -l`
	if [[ $count == 0 ]]; then
		${S3CMD} mb s3://${S3_BUCKET_NAME} ${S3_OPTS}
		log "New S3 BUCKET ${S3_BUCKET_NAME} has been created....";
	fi
}

create_dumps() {
	for i in $(seq 0 $((${#DBS[@]} - 1))); do
    		DB=${DBS[$i]}
    		log "Backuping ${DB}"
    		db_dump "${DB}" "${TMP_PATH}/${DB}-${DATE}.sql"
    		if [ $? -eq 0 ];
         	then
             		log "Done! DB: ${DB}-${DATE}.sql. DATE: ${DATE}";
         	else
             		log "ERROR making dump. DB: ${DB}. DATE: ${DATE}.";
         	fi
	done
	log "Done backing up all databases.";
}

remove_old_backups_s3() {
	${S3CMD} ${S3_OPTS} ls s3://${S3_BUCKET_NAME} |sort -k1,2 -r|tail -n +${NUMBER_OF_BACKUPS} | awk '{print $4}' | while read -r OLD_BACKUP;
  	do
		if [[ ${OLD_BACKUP} != "" ]];  then ${S3CMD} ${S3_OPTS} del "${OLD_BACKUP}"; fi
		log "Old Backup ${OLD_BACKUP} has been deleted ....."
	done;
}

remove_old_backups() {
	local back_dir=$1
	ls -tp ${back_dir} | grep -v '/$' | tail -n +${NUMBER_OF_BACKUPS} | xargs -I {} rm -- ${back_dir}/{}
}

check_mount() {
	local mount_point=$1
	if ${MOUNT} | ${GREP} ${mount_point} > /dev/null; then
		echo "mount ${mount_point} is fine"
	else
    		log "ERROR: ${mount_point} Mount point not found";
	fi
}

if [ ! -e "${TMP_PATH}" ]; then mkdir -p "${TMP_PATH}"; fi

get_databases
create_dumps
tar czf ~/BACKUP-${DATE}.tar.gz -C ${TMP_PATH}/ .

case $BACKUP_MODE in
     "lfs" )
	create_directories $BACKUPDIR
	mv ~/BACKUP-${DATE}.tar.gz $BACKUPDIR
	remove_old_backups $BACKUPDIR
         ;;
     "nfs" )
	check_mount $BACKUPDIR
	mv ~/BACKUP-${DATE}.tar.gz $BACKUPDIR
	remove_old_backups $BACKUPDIR
         ;;
     "s3" )
	rpm -qa | grep -qw s3cmd || yum install -y s3cmd
	S3CMD=`which s3cmd`
	create_S3_bucket
	${S3CMD} put ${S3_OPTS} -f ~/BACKUP-${DATE}.tar.gz s3://${S3_BUCKET_NAME}/BACKUP-${DATE}.tar.gz
	remove_old_backups_s3
	;;
esac

rm -f ~/BACKUP-${DATE}.tar.gz
rm -rf ${TMP_PATH}
exit 0

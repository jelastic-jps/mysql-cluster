#!/bin/sh
# Copyright Abandoned 1996 TCX DataKonsult AB & Monty Program KB & Detron HB
# This file is public domain and comes with NO WARRANTY of any kind

# MySQL daemon start/stop script.

# Usually this is put in /etc/init.d (at least on machines SYSV R4 based
# systems) and linked to /etc/rc3.d/S99mysql and /etc/rc0.d/K01mysql.
# When this is done the mysql server will be started when the machine is
# started and shut down when the systems goes down.

# Comments to support chkconfig on RedHat Linux
# chkconfig: 2345 64 36
# description: A very fast and reliable SQL database engine.

# Comments to support LSB init script conventions
### BEGIN INIT INFO
# Provides: mysql
# Required-Start: $local_fs $network $remote_fs
# Should-Start: ypbind nscd ldap ntpd xntpd
# Required-Stop: $local_fs $network $remote_fs
# Default-Start:  2 3 4 5
# Default-Stop: 0 1 6
# Short-Description: start and stop MySQL
# Description: MySQL is a very fast and reliable SQL database engine.
### END INIT INFO

# If you install MySQL on some other places than /usr, then you
# have to do one of the following things for this script to work:
#
# - Run this script from within the MySQL installation directory
# - Create a /etc/my.cnf file with the following information:
#   [mysqld]
#   basedir=<path-to-mysql-installation-directory>
# - Add the above to any other configuration file (for example ~/.my.ini)
#   and copy my_print_defaults to /usr/bin
# - Add the path to the mysql-installation-directory to the basedir variable
#   below.
#
# If you want to affect other MySQL variables, you should make your changes
# in the /etc/my.cnf, ~/.my.cnf or other MySQL configuration files.

# If you change base dir, you must also change datadir. These may get
# overwritten by settings in the MySQL configuration files.
SYSTEMCTL_SKIP_REDIRECT=1

/usr/bin/chown -R mysql:mysql /var/log/mysql &>/dev/null;

[ -f /.jelenv ] && . /.jelenv

basedir=
datadir=

# Default value, in seconds, afterwhich the script should timeout waiting
# for server start.
# Value here is overridden by value in my.cnf.
# 0 means don't wait at all
# Negative numbers mean to wait indefinitely
service_startup_timeout=900

# Lock directory for RedHat / SuSE.
lockdir='/var/lock/subsys'
lock_file_path="$lockdir/mysql"

oom_score_adj_level="-700"

# The following variables are only set for letting mysql.server find things.

# Set some defaults
mysqld_pid_file_path=
if test -z "$basedir"
then
  basedir=/usr
  bindir=/usr/bin
  if test -z "$datadir"
  then
    datadir=/var/lib/mysql
  fi
  sbindir=/usr/sbin
  libexecdir=/usr/sbin
else
  bindir="$basedir/bin"
  if test -z "$datadir"
  then
    datadir="$basedir/data"
  fi
  sbindir="$basedir/sbin"
  if test -f "$basedir/bin/mysqld"
  then
    libexecdir="$basedir/bin"
  else
    libexecdir="$basedir/libexec"
  fi
fi

# datadir_set is used to determine if datadir was set (and so should be
# *not* set inside of the --basedir= handler.)
datadir_set=

#
# Use LSB init script functions for printing messages, if possible
#
lsb_functions="/lib/lsb/init-functions"
if test -f $lsb_functions ; then
  . $lsb_functions
else
  log_success_msg()
  {
    echo " SUCCESS! $@"
  }
  log_failure_msg()
  {
    echo " ERROR! $@"
  }
fi

PATH="/sbin:/usr/sbin:/bin:/usr/bin:$basedir/bin"
export PATH

mode=$1    # start or stop

[ $# -ge 1 ] && shift


other_args="$*"   # uncommon, but needed when called from an RPM upgrade action
           # Expected: "--skip-networking --skip-grant-tables"
           # They are not checked here, intentionally, as it is the resposibility
           # of the "spec" file author to give correct arguments only.

wsres_args=""
if test -f /var/lib/mysql/grastate.dat; then
  SAFE_TO_BOOTSTRAP=$(awk '/^safe_to_bootstrap:/{print $2}' /var/lib/mysql/grastate.dat)
  [ $SAFE_TO_BOOTSTRAP -eq 1 ] && wsres_args="--wsrep-new-cluster"
fi

case `echo "testing\c"`,`echo -n testing` in
    *c*,-n*) echo_n=   echo_c=     ;;
    *c*,*)   echo_n=-n echo_c=     ;;
    *)       echo_n=   echo_c='\c' ;;
esac

parse_server_arguments() {
  for arg do
    case "$arg" in
      --basedir=*)  basedir=`echo "$arg" | sed -e 's/^[^=]*=//'`
                    bindir="$basedir/bin"
                    if test -z "$datadir_set"; then
                      datadir="$basedir/data"
                    fi
                    sbindir="$basedir/sbin"
                    if test -f "$basedir/bin/mysqld"
                    then
                      libexecdir="$basedir/bin"
                    else
                      libexecdir="$basedir/libexec"
                    fi
                    libexecdir="$basedir/libexec"
        ;;
      --datadir=*)  datadir=`echo "$arg" | sed -e 's/^[^=]*=//'`
                    datadir_set=1
        ;;
      --pid-file=*) mysqld_pid_file_path=`echo "$arg" | sed -e 's/^[^=]*=//'` ;;
      --service-startup-timeout=*) service_startup_timeout=`echo "$arg" | sed -e 's/^[^=]*=//'` ;;
    esac
  done
}

wait_for_pid () {
  verb="$1"           # created | removed
  pid="$2"            # process ID of the program operating on the pid-file
  pid_file_path="$3" # path to the PID file.

  i=0
  avoid_race_condition="by checking again"

  while test $i -ne $service_startup_timeout ; do

    case "$verb" in
      'created')
        # wait for a PID-file to pop into existence.
        test -s "$pid_file_path" && i='' && break
        ;;
      'removed')
        # wait for this PID-file to disappear
        test ! -s "$pid_file_path" && i='' && break
        ;;
      *)
        echo "wait_for_pid () usage: wait_for_pid created|removed pid pid_file_path"
        exit 1
        ;;
    esac

    # if server isn't running, then pid-file will never be updated
    if test -n "$pid"; then
      if kill -0 "$pid" 2>/dev/null; then
        :  # the server still runs
      else
        # The server may have exited between the last pid-file check and now.
        if test -n "$avoid_race_condition"; then
          avoid_race_condition=""
          continue  # Check again.
        fi

        # there's nothing that will affect the file.
        log_failure_msg "The server quit without updating PID file ($pid_file_path)."
        return 1  # not waiting any more.
      fi
    fi

    echo $echo_n ".$echo_c"
    i=`expr $i + 1`
    sleep 1

  done

  if test -z "$i" ; then
    log_success_msg
    return 0
  else
    log_failure_msg
    return 1
  fi
}

# Get arguments from the my.cnf file,
# the only group, which is read from now on is [mysqld]
if test -x ./bin/my_print_defaults
then
  print_defaults="./bin/my_print_defaults"
elif test -x $bindir/my_print_defaults
then
  print_defaults="$bindir/my_print_defaults"
elif test -x $bindir/mysql_print_defaults
then
  print_defaults="$bindir/mysql_print_defaults"
else
  # Try to find basedir in /etc/my.cnf
  conf=/etc/my.cnf
  print_defaults=
  if test -r $conf
  then
    subpat='^[^=]*basedir[^=]*=\(.*\)$'
    dirs=`sed -e "/$subpat/!d" -e 's//\1/' $conf`
    for d in $dirs
    do
      d=`echo $d | sed -e 's/[  ]//g'`
      if test -x "$d/bin/my_print_defaults"
      then
        print_defaults="$d/bin/my_print_defaults"
        break
      fi
      if test -x "$d/bin/mysql_print_defaults"
      then
        print_defaults="$d/bin/mysql_print_defaults"
        break
      fi
    done
  fi

  # Hope it's in the PATH ... but I doubt it
  test -z "$print_defaults" && print_defaults="my_print_defaults"
fi

#
# Read defaults file from 'basedir'.   If there is no defaults file there
# check if it's in the old (depricated) place (datadir) and read it from there
#

extra_args=""
if test -r "$basedir/my.cnf"
then
  extra_args="-e $basedir/my.cnf"
else
  if test -r "$datadir/my.cnf"
  then
    extra_args="-e $datadir/my.cnf"
  fi
fi

parse_server_arguments `$print_defaults $extra_args mysqld server mysql_server mysql.server`

#
# Set pid file if not given
#
if test -z "$mysqld_pid_file_path"
then
  mysqld_pid_file_path=$datadir/`hostname`.pid
else
  case "$mysqld_pid_file_path" in
    /* ) ;;
    * )  mysqld_pid_file_path="$datadir/$mysqld_pid_file_path" ;;
  esac
fi

# source other config files
[ -f /etc/default/mysql ] && . /etc/default/mysql
[ -f /etc/sysconfig/mysql ] && . /etc/sysconfig/mysql
[ -f /etc/conf.d/mysql ] && . /etc/conf.d/mysql
###################### Jelastic patch ########################

CHKCONFIG=`which chkconfig`
MySQLConfigPath="/etc/my.cnf"
RamMin=200
LOG_FILE="/var/log/autoconfig.log"
VERBOSE=0

log() {
    if [ $VERBOSE -gt 0 ]; then
        echo -n `date +%D.%k:%M:%S.%N` >> ${LOG_FILE}
        echo ": $@" >> ${LOG_FILE}
    fi
    if [ $VERBOSE -gt 1 ]; then
        echo -n `date +%D.%k:%M:%S.%N`
        echo ": $@"
    fi
}

backupconfig() {
    cp $1 $1.autobackup
}

get_mysql_key_buffer_size() {
    Default=
    Min=
    Suffix='M'

    if [[ $1 -gt $RamMin ]]; then
  Result=$(($1 / 4))
    else
  Result=$(($1 / 8))
    fi
    echo "${Result}${Suffix}"
}

get_mysql_table_open_cache() {
    Default=64
    Min=
    Suffix=''

    if [[ $1 -gt $RamMin ]]; then
  Result=256
    else
  Result=$Default
    fi
    echo "${Result}${Suffix}"
}

get_mysql_myisam_sort_buffer_size() {
  echo "$(($1 / 3))M"
}

get_mysql_innodb_buffer_pool_size(){
  echo "$(($1 / 2))M"
}

regenerate_config(){
  TotalMem=`free -m | grep Mem | awk '{print $2}'`        # Total memory size in bytes
  AutoChangeConfig=`grep -o -P "^#Jelastic autoconfiguration mark." $MySQLConfigPath`
  key_buffer_size=$(get_mysql_key_buffer_size $TotalMem)
  table_open_cache=$(get_mysql_table_open_cache $TotalMem)
  myisam_sort_buffer_size=$(get_mysql_myisam_sort_buffer_size $TotalMem)
  innodb_buffer_pool_size=$(get_mysql_innodb_buffer_pool_size $TotalMem)
  NamesOfVariables="key_buffer_size table_open_cache myisam_sort_buffer_size innodb_buffer_pool_size"

  #Check autoconfiguration mark
  if [[ $AutoChangeConfig != "#Jelastic autoconfiguration mark." ]]; then
    log "Autoconfiguration mark not found. Skip autoconfig."
  else
    backupconfig $MySQLConfigPath
  for VariableName in ${NamesOfVariables}
    do
      MySQLConfigParametrName=${VariableName}
      MySQLConfigParametrValue=${!VariableName}
      sed -i 's/^'${MySQLConfigParametrName}'.*=.[0-9]*[a-zA-Z]*/'${MySQLConfigParametrName}' = '${MySQLConfigParametrValue}'/g' ${MySQLConfigPath}
      echo "Parametr ${MySQLConfigParametrName} set to ${MySQLConfigParametrValue}"
    done
    /usr/bin/setfacl -m g:ssh-access:wr ${MySQLConfigPath} &>/dev/null;
  fi
    [ -f /etc/systemd/system/mysql.service ] && rm -f /etc/systemd/system/mysql.service && systemctl daemon-reload
    [ -f /etc/systemd/system/mysqld.service ] && rm -f /etc/systemd/system/mysqld.service && systemctl daemon-reload
    [ -f /etc/phpMyAdmin/config.inc.php ] && {
        randomBlowfishSecret=$( openssl rand -hex 32 2>/dev/null; ) ;
        sed -i "s/\$cfg\['blowfish_secret'\]\s*=.*YOU MUST.*/\$cfg\['blowfish_secret'\] = '$randomBlowfishSecret';/" /etc/phpMyAdmin/config.inc.php ;
    }
}

################################################################

case "$mode" in
  'start')
    # Start daemon
  PHPMYADMIN_ENABLED=${PHPMYADMIN_ENABLED^^}
  if [ "x$PHPMYADMIN_ENABLED" == "x1" ] ||  [ "x$PHPMYADMIN_ENABLED" == "xENABLED" ] || [ "x$PHPMYADMIN_ENABLED" == "xTRUE" ]
  then
      service httpd start > /dev/null 2>&1 #JE-14326
  fi
  $CHKCONFIG  --level 3  mysql on
  regenerate_config;
    # Safeguard (relative paths, core dumps..)
    cd $basedir

    echo $echo_n "Starting MySQL"
    if test -x $bindir/mysqld_safe
    then
      # Give extra arguments to mysqld with the my.cnf file. This script
      # may be overwritten at next upgrade.
      $bindir/mysqld_safe --datadir="$datadir" --pid-file="$mysqld_pid_file_path" $other_args $wsres_args >/dev/null 2>&1 &
      wait_for_pid created "$!" "$mysqld_pid_file_path"; return_value=$?

      # Make lock for RedHat / SuSE
      if test -w "$lockdir"
      then
        touch "$lock_file_path"
      fi

      mysqld_pid=`cat "$mysqld_pid_file_path"`

      if test ! -z $mysqld_pid ; then
        echo $oom_score_adj_level >  /proc/${mysqld_pid}/oom_score_adj 2>&1 ;
      fi

      exit $return_value
    else
      log_failure_msg "Couldn't find MySQL server ($bindir/mysqld_safe)"
    fi
    ;;

  'stop')
    # Stop daemon. We use a signal here to avoid having to know the
    # root password.

    service httpd stop &>/dev/null

    if test -s "$mysqld_pid_file_path"
    then
      mysqld_pid=`cat "$mysqld_pid_file_path"`

      if (kill -0 $mysqld_pid 2>/dev/null)
      then
        echo $echo_n "Shutting down MySQL"
        kill $mysqld_pid
        # mysqld should remove the pid file when it exits, so wait for it.
        wait_for_pid removed "$mysqld_pid" "$mysqld_pid_file_path"; return_value=$?
      else
        log_failure_msg "MySQL server process #$mysqld_pid is not running!"
        rm "$mysqld_pid_file_path"
      fi

      # Delete lock for RedHat / SuSE
      if test -f "$lock_file_path"
      then
        rm -f "$lock_file_path"
      fi
      exit $return_value
    else
      log_failure_msg "MySQL server PID file could not be found!"
    fi
    ;;

  'restart')
    # Stop the service and regardless of whether it was
    # running or not, start it again.
    if $0 stop  $other_args; then
      $0 start $other_args
    else
      log_failure_msg "Failed to stop running server, so refusing to try to start."
      exit 1
    fi
    ;;

  'reload'|'force-reload')
    if test -s "$mysqld_pid_file_path" ; then
      read mysqld_pid <  "$mysqld_pid_file_path"
      kill -HUP $mysqld_pid && log_success_msg "Reloading service MySQL"
      touch "$mysqld_pid_file_path"
    else
      log_failure_msg "MySQL PID file could not be found!"
      exit 1
    fi
    ;;
  'status')
    # First, check to see if pid file exists
    if test -s "$mysqld_pid_file_path" ; then
      read mysqld_pid < "$mysqld_pid_file_path"
      if kill -0 $mysqld_pid 2>/dev/null ; then
        log_success_msg "MySQL running ($mysqld_pid)"
        exit 0
      else
        log_failure_msg "MySQL is not running, but PID file exists"
        exit 1
      fi
    else
      # Try to find appropriate mysqld process
      mysqld_pid=`pidof $libexecdir/mysqld`
      if test -z $mysqld_pid ; then
        if test -f "$lock_file_path" ; then
          log_failure_msg "MySQL is not running, but lock file ($lock_file_path) exists"
          exit 2
        fi
        log_failure_msg "MySQL is not running"
        exit 3
      else
        log_failure_msg "MySQL is running but PID file could not be found"
        exit 4
      fi
    fi
    ;;
  'configtest')
    # Safeguard (relative paths, core dumps..)
    cd $basedir
    echo $echo_n "Testing MySQL configuration syntax"
    daemon=$bindir/mysqld
    if test -x $libexecdir/mysqld
    then
      daemon=$libexecdir/mysqld
    elif test -x $sbindir/mysqld
    then
      daemon=$sbindir/mysqld
    elif test -x `which mysqld`
    then
      daemon=`which mysqld`
    else
      log_failure_msg "Unable to locate the mysqld binary!"
      exit 1
    fi
    help_out=`$daemon --help 2>&1`; r=$?
    if test "$r" != 0 ; then
      log_failure_msg "$help_out"
      log_failure_msg "There are syntax errors in the server configuration. Please fix them!"
    else
      log_success_msg "Syntax OK"
    fi
    exit $r
    ;;
  regenerate-config)
    regenerate_config
  ;;
  *)
      # usage
      basename=`basename "$0"`
      echo "Usage: $basename  {start|stop|restart|reload|force-reload|status|configtest}  [ MySQL server options ]"
      exit 1
    ;;
esac

exit 0

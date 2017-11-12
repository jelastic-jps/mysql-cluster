//@req(service, nodeId)

if (service == 'db') {
    cmd = '[ -x "$(command -v mysql)" ] && mysql -u ${settings.db_user} -p${settings.db_password} -e "quit";'
    cmd += '[ -x "$(command -v psql)" ] && { export PGPASSWORD=${settings.db_password}; psql -U ${settings.db_user} -d postgres -c "\\q"; }'
    mark = ['Access denied', 'authentication failed']
    warning = 'DB User and Password: authentication check failed. Please specify correct credentials for the database located in node' + nodeId + '.'
    return Check(cmd, mark, warning)
} 

if (service == 's3') {
    cmd = 'rpm -qa | grep -qw s3cmd || yum install -y s3cmd; s3cmd ls --access_key=${settings.access_key} --secret_key=${settings.secret_key} --host=${settings.s3_host} --no-check-hostname'
    mark = ['SignatureDoesNotMatch']
    warning = 'S3 Credentials: authentication check failed. Please specify correct host and credentials for S3 storage.'
    return Check(cmd, mark, warning)
}

return {result: 99, error: 'Service + [' + service + '] not found'}

function Check(cmd, mark, warning){
    resp = ExecCmd(cmd)
    if (resp.result != 0) {
        for (var i = 0; i < mark.length; i++) {
            if (resp.responses[0].errOut.indexOf(mark[i]) > -1) {
                return {
                    result: 'warning',
                    message: warning
                }
            }
        }
        return resp
    }
    return {result: 0}
}

function ExecCmd(cmd){
    return jelastic.env.control.ExecCmdById('${env.envName}', session, nodeId, toJSON([{command: cmd}]), true, 'root');
} 

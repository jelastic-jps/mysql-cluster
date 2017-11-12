//@req(service, nodeId)

if (service == 'db') {
    cmd = 'mysql -u ${settings.db_user} -p${settings.db_password} -e "quit"'
    mark = 'Access denied'
    warning = 'DB User and Password: authentication check failed. Please specify correct credentials for the database located in node' + nodeId + '.'
    return Check(cmd, mark, warning)
} 

if (service == 's3') {
    cmd = 'rpm -qa | grep -qw s3cmd || yum install -y s3cmd; s3cmd ls --access_key=${settings.access_key} --secret_key=${settings.secret_key} --host=${settings.s3_host} --no-check-hostname'
    mark = 'SignatureDoesNotMatch'
    warning = 'S3 Credentials: authentication check failed. Please specify correct host and credentials for S3 storage.'
    return Check(cmd, mark, warning)
}

return {result: 99, error: 'Service + [' + service + '] not found'}

function Check(cmd, mark, warning){
    resp = ExecCmd(cmd)
    if (resp.result != 0) {
        if (resp.responses[0].errOut.indexOf(mark) > -1) {
            return {
                result: 'warning',
                message: warning
            }
        } else return resp
    }
    return {result: 0}
}

function ExecCmd(cmd){
    return jelastic.env.control.ExecCmdById('${env.envName}', session, nodeId, toJSON([{command: cmd}]), true, 'root');
} 

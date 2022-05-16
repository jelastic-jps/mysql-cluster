var SQLDB = "sqldb",
    AUTH_ERROR_CODE = 701,
    envName = "${env.name}",
    user = getParam('user', ''),
    password = getParam('password', ''),
    GALERA = "galera",
    FAILED = "failed",
    SUCCESS = "success",
    WARNING = "warning",
    ROOT = "root",
    DOWN = "down",
    isRestore = false,
    item,
    resp;

if (user && password) isRestore = true;
user = user || "$MONITOR_USER";
password = password || "$MONITOR_PSWD";

resp = cmd({
    command: "curl --silent https://dot.jelastic.com/download/misc/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh --mysql-user " + user + " --mysql-password " + password + exec,
    nodeGroup: SQLDB
});
if (resp.result != 0) return resp;

if (resp.responses.length) {
    for (var i = 0, n = resp.responses.length; i < n; i++) {
        item = resp.responses[i].out;
        item = JSON.parse(item);

        if (item.result == 0 && item.node_type == GALERA) {
            if (item.service_status == DOWN || item.status == FAILED || item.galera_size != "ok") {
                return {
                    result: 99,
                    type: SUCCESS
                }
            }
        }
        
        if (item.result == AUTH_ERROR_CODE) {
            return {
                type: WARNING,
                message: item.error
            }
            
        }
    }
}

return {
    result: !isRestore ? 200 : 201,
    type: SUCCESS
};


function cmd(values) {
    var resp;
                
    values = values || {};
    
    if (values.nodeid) {
        resp = api.env.control.ExecCmdById(envName, session, values.nodeid, toJSON([{ command: values.command }]), true, ROOT);
    } else {
        resp = api.env.control.ExecCmdByGroup(envName, session, values.nodeGroup || SQLDB, toJSON([{ command: values.command }]), true, false, ROOT);
    }
    
    return resp;
};

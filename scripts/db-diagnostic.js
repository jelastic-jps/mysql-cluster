var SCRIPT_URL_CMD = "curl -fsSL \"${globals.sh_script}\" -o /home/jelastic/diagnostic.sh && bash /home/jelastic/diagnostic.sh ",
    SUCCESS = "success",
    WARNING = "warning",
    NO_ERRORS_FOUND_CODE = 1000,
    ERRORS_FOUND_CODE = 1001,
    RECOVERED_CODE =  1002,
    ERRORS_FOUND_CODE_CMD=1,
    AUTH_ERROR_CODE = 2,
    CMD_ERROR = 4109,
    ROOT = "root",
    parsed = {},
    SQLDB = "sqldb",
    envName = "${env.name}",
    login = "${this.login:}",
    password = "${this.password:}",
    isRecovering = false,
    statuses = [],
    bootstraps = [],
    resp,
    nodes,
    id;
    
var responses = [], item, obj = {};
    
isRecovering = !!(login && password);
    
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

function getMySQLStatuses () {
    if (!statuses.length) {
        for (var i = 0, n = responses.length; i < n; i++) {
            statuses.push(responses[i].service_status);
        }
    }
    
    return statuses;
};

function countMatches(array, number) {
    return array.filter(function (value) { return value == number}).length;
};

function getBootstapValues() {
    if (!bootstraps.length) {
        for (var i = 0, n = responses.length; i < n; i++) {
            bootstraps.push(responses[i].bootstrap);
        }
    }
    
    return bootstraps;
};

function stopMySQLServices() {
    return cmd({
        nodeGroup: SQLDB,
        command: "service mysql stop"
    });
};

function killPIDFile() {
    return cmd({
        command: "rm -rf /var/lib/mysql/*.pid"
    })
};

resp = api.env.control.GetEnvInfo(envName, session);
if (resp.result != 0) return resp;

nodes = resp.nodes;

resp = cmd({
    command: SCRIPT_URL_CMD + " ${nodes.sqldb.length}",
    nodeGroup: SQLDB
});

if (resp.result == CMD_ERROR) {
    if (resp.responses && resp.responses.length) {
        
        for (var i = 0, n = resp.responses.length; i < n; i++) {
            
            item = resp.responses[i];
            var parsed = JSON.parse(item.out);
            
            responses.push({
                nodeid: item.nodeid,
                service_status: parsed.service_status,
                size: parsed.size,
                status: parsed.status,
                bootstrap: parsed.bootstrap,
                exitStatus: item.exitStatus
            });
        }
    }
}

api.marketplace.console.WriteLog("responses->" + responses);

            
for (i = 0, n = responses.length; i < n; i++) {
    item = responses[i];
    
    if (item.exitStatus == AUTH_ERROR_CODE) {
      return {
        type: WARNING,  //AUTH ERROR
        message: item.out
      };
    }
      
    if (item.exitStatus == ERRORS_FOUND_CODE_CMD) {
      
      if (isRecovering) { //recovery action
          //CASE 1:
          resp = getMySQLStatuses();
          if (countMatches(resp, 1) == "${nodes.sqldb.length}" && getBootstapValues().indexOf(1) != -1) {
              resp = stopMySQLServices();
              if (resp.result != 0) return resp;
              
              resp = killPIDFile();
              if (resp.result != 0) return resp;
          }
          
      }

      return {
          result: ERRORS_FOUND_CODE, //when errors were found
          type: SUCCESS
          
      };
    }
}


return {
    result: NO_ERRORS_FOUND_CODE,
    type: SUCCESS
};

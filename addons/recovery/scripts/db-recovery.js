var SQLDB = "sqldb",
    AUTH_ERROR_CODE = 701,
    UNABLE_RESTORE_CODE = 98,
    FAILED_CLUSTER_CODE = 99,
    envName = "${env.name}",
    user = getParam('user', ''),
    password = getParam('password', ''),
    exec = getParam('exec', ''),
    failedNodesAddresses = [],
    GALERA = "galera",
    MASTER = "master",
    SLAVE = "slave",
    FAILED = "failed",
    SUCCESS = "success",
    WARNING = "warning",
    ROOT = "root",
    DOWN = "down",
    UP = "up",
    OK = "ok",
    isRestore = false,
    masterCount = 0,
    envInfo,
    nodeGroups,
    donorIps = {},
    scenario = "",
    scheme,
    item,
    resp;
    
if (user && password) isRestore = true;
exec = exec || " --diagnostic";
user = user || "$MONITOR_USER";
password = password || "$MONITOR_PSWD";

resp = getNodeGroups();
if (resp.result != 0) return resp;

nodeGroups = resp.nodeGroups;

for (var i = 0, n = nodeGroups.length; i < n; i++) {
    if (nodeGroups[i].name == SQLDB && nodeGroups[i].cluster && nodeGroups[i].cluster.enabled) {
        if (nodeGroups[i].cluster.settings) {
            scheme = nodeGroups[i].cluster.settings.scheme;
            break;
        }
    }
}

resp = execRecovery();

resp = parseOut(resp.responses);

api.marketplace.console.WriteLog("scheme->" + scheme);
api.marketplace.console.WriteLog("isRestore->" + isRestore);
api.marketplace.console.WriteLog("scenario->" + scenario);
api.marketplace.console.WriteLog("donorIps[scheme]->" + donorIps[scheme]);

if (isRestore) {
    
    if (!failedNodesAddresses.length) {
        return {
            result: !isRestore ? 200 : 201,
            type: SUCCESS
        }; 
    }
    
    if (!scenario || !donorIps[scheme]) {
        return {
            result: UNABLE_RESTORE_CODE,
            type: SUCCESS
        }
    }
    
    for (var k = 0, l = failedNodesAddresses.length; k < l; k++) {
        resp = getNodeIdByIp(failedNodesAddresses[k]);
        if (resp.result != 0) return resp;
    
        resp = execRecovery(scenario, donorIps[scheme], resp.nodeid);
        if (resp.result != 0) return resp;
        
        resp = parseOut(resp.responses);
        if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
    }
    
} else {
    return resp;
}

function parseOut(data) {
    var result,
        nodeid;
    
    if (data.length) {
        for (var i = 0, n = data.length; i < n; i++) {
            nodeid = data[i].nodeid;
            item = data[i].out;
            item = JSON.parse(item);

            if (item.result == 0) {
                switch(String(scheme)) {
                    case GALERA:
                        if (item.service_status == DOWN || item.status == FAILED || item.galera_size != "ok") {
                            scenario = " --scenario restore_galera";
                            donorIps[GALERA] = " --donor-ip " + GALERA;
                        };
                        
                    case MASTER:
                        if (item.service_status == DOWN && item.status == FAILED) {
                            scenario = " --scenario restore_master_from_master";
                            
                            if (failedNodesAddresses.indexOf(item.address) == -1) {
                                failedNodesAddresses.push(item.address);
                            }
                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }
                        } else if (item.service_status == UP) {
                            donorIps[MASTER] = " --donor-ip " + item.address;
                        };
                        break;
                        
                    case SLAVE:
                        if (item.service_status == DOWN && item.status == FAILED) {
                            if (item.node_type == MASTER) {
                                scenario = " --scenario restore_master_from_slave";
                            } else {
                                scenario = " --scenario restore_slave_from_master";
                            }
                            if (failedNodesAddresses.indexOf(item.address) == -1) {
                                failedNodesAddresses.push(item.address);
                            }
                            
                             if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }
                        } else if (item.service_status == UP) {
                            donorIps[SLAVE] = " --donor-ip " + item.address;
                        };
                        
                        break;                        
                }
            } else {
                return {
                    result: isRestore ? UNABLE_RESTORE_CODE : FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }
            
            if (item.result == AUTH_ERROR_CODE) {
                return {
                    type: WARNING,
                    message: item.error
                };
                
            }
            
        }
        
        return {
            result: !isRestore ? 200 : 201,
            type: SUCCESS
        }; 
    }
};

return {
    result: !isRestore ? 200 : 201,
    type: SUCCESS
};

function getNodeIdByIp(address) {
    var envInfo,
        nodes,
        resp,
        id = "";
        
    envInfo = getEnvInfo();
    if (envInfo.result != 0) return envInfo;
    
    nodes = envInfo.nodes;
        
    for (var i = 0, n = nodes.length; i < n; i++) {
        if (nodes[i].address == address) {
            id = nodes[i].id;
            break;
        }
    }
    
    return {
        result: 0,
        nodeid : id
    }
};

function execRecovery(scenario, donor, nodeid) {
    var action = "";
    
    if (scenario && donor) {
        action = scenario + donor;
    } else {
        action = exec;
    }
    
    api.marketplace.console.WriteLog("curl --silent https://github.com/jelastic-jps/mysql-cluster/raw/v2.5.0/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh --mysql-user " + user + " --mysql-password " + password + action);
    return cmd({
        command: "curl --silent https://dot.jelastic.com/download/misc/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh --mysql-user " + user + " --mysql-password " + password + action,
        nodeid: nodeid || ""
    });
};

function getEnvInfo() {
    var resp;
    
    if (!envInfo) {
        envInfo = api.env.control.GetEnvInfo(envName, session);
    }
    
    return envInfo;
};

function getNodeGroups() {
    var envInfo,
        nodeGroups;

    envInfo = getEnvInfo();
    if (envInfo.result != 0) return envInfo;
    
    return {
        result: 0,
        nodeGroups: envInfo.nodeGroups
    }
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

var SQLDB = "sqldb",
    AUTH_ERROR_CODE = 701,
    UNABLE_RESTORE_CODE = 98,
    FAILED_CLUSTER_CODE = 99,
    envName = "${env.name}",
    user = getParam('user', ''),
    password = getParam('password', ''),
    exec = getParam('exec', ''),
    failedPrimary = [],
    failedNodes = [],
    isMasterFailed = false,
    GALERA = "galera",
    PRIMARY = "primary",
    SECONDARY = "secondary",
    FAILED = "failed",
    SUCCESS = "success",
    WARNING = "warning",
    MASTER = "master",
    SLAVE = "slave",
    ROOT = "root",
    DOWN = "down",
    UP = "up",
    OK = "ok",
    isRestore = false,
    envInfo,
    nodeGroups,
    donorIps = {},
    primaryDonorIp = "",
    scenario = "",
    scheme,
    item,
    resp;

if (user && password) isRestore = true;
exec = exec || " --diagnostic";
api.marketplace.console.WriteLog("exec->" + exec);
if (exec) {
    api.marketplace.console.WriteLog("in exec->");
    user = user || "$REPLICA_USER";
    password = password || "$REPLICA_PSWD";
}

resp = getNodeGroups();
if (resp.result != 0) return resp;

nodeGroups = resp.nodeGroups;

for (var i = 0, n = nodeGroups.length; i < n; i++) {
    if (nodeGroups[i].name == SQLDB && nodeGroups[i].cluster && nodeGroups[i].cluster.enabled) {
        if (nodeGroups[i].cluster.settings) {
            scheme = nodeGroups[i].cluster.settings.scheme;
            if (scheme == SLAVE) scheme = SECONDARY;
            if (scheme == MASTER) scheme = PRIMARY;
            break;
        }
    }
}

resp = execRecovery();

resp = parseOut(resp.responses, true);

api.marketplace.console.WriteLog("schem11e->" + scheme);
api.marketplace.console.WriteLog("isRestore->" + isRestore);
api.marketplace.console.WriteLog("scenario->" + scenario);
api.marketplace.console.WriteLog("donorIps[scheme]->" + donorIps[scheme]);
api.marketplace.console.WriteLog("failedNodes000->" + failedNodes);

if (isRestore) {
    if (!failedNodes.length) {
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

    if (isMasterFailed) {
        resp = getSlavesOnly();
        if (resp.result != 0) return resp;

        failedNodes = resp.nodes;
    }

    api.marketplace.console.WriteLog("before loop failedNodes->" + failedNodes);
    for (var k = 0, l = failedNodes.length; k < l; k++) {
        resp = getNodeIdByIp(failedNodes[k].address);
        if (resp.result != 0) return resp;

        api.marketplace.console.WriteLog("before execRecovery resp.nodeid1->" + resp.nodeid);
        resp = execRecovery(scenario, donorIps[scheme], resp.nodeid);
        if (resp.result != 0) return resp;

        resp = parseOut(resp.responses, true);
        if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
    }

} else {
    return resp;
}

function parseOut(data, restoreMaster) {
    var resp,
        nodeid,
        statusesUp = false;

    if (scheme != GALERA) {
        failedNodes = [];
        failedPrimary = [];
        donorIps = {};
    }

    if (data.length) {
        for (var i = 0, n = data.length; i < n; i++) {
            nodeid = data[i].nodeid;
            item = data[i].out;
            item = JSON.parse(item);

            api.marketplace.console.WriteLog("item111->" + item);
            if (item.result == 0) {
                switch(String(scheme)) {
                    case GALERA:
                        if ((item.service_status == UP || item.status == OK) && item.galera_myisam != OK) {
                            return {
                                type: WARNING,
                                message: "There are MyISAM tables in the Galera Cluster. These tables should be converted in InnoDB type"
                            }
                        }
                        if (item.service_status == DOWN || item.status == FAILED) { // || item.galera_size != OK
                            scenario = " --scenario restore_galera";
                            if (!donorIps[scheme]) {
                                donorIps[GALERA] = GALERA;
                            }

                            failedNodes.push({
                                address: item.address,
                                scenario: scenario
                            });

                        }

                        if (!isRestore && failedNodes.length) {
                            return {
                                result: FAILED_CLUSTER_CODE,
                                type: SUCCESS
                            };
                        }
                        break;

                    case PRIMARY:
                        if (item.service_status == DOWN || item.status == FAILED) {
                            scenario = " --scenario restore_primary_from_primary";

                            if (item.status == FAILED) {
                                failedNodes.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                            }
                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }
                        }

                        if (!donorIps[scheme] && item.service_status == UP && item.status == OK) {
                            donorIps[PRIMARY] = item.address;
                        }
                        break;

                    case SECONDARY:
                        if (item.service_status == DOWN && item.status == FAILED) {
                            if (item.node_type == PRIMARY) {
                                scenario = " --scenario restore_primary_from_secondary";
                                failedPrimary.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                                isMasterFailed = true;
                            } else {
                                scenario = " --scenario restore_secondary_from_primary";
                                failedNodes.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                            }
                        }

                        if (item.service_status == DOWN || item.status == FAILED) {
                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }

                            if (item.node_type == PRIMARY) {
                                scenario = " --scenario restore_primary_from_secondary";
                                failedPrimary.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                                isMasterFailed = true;
                            }
                        }

                        if (item.node_type == PRIMARY) {
                            if (item.service_status == UP) {
                                primaryDonorIp = item.address;
                                continue;
                            }
                        }

                        if (item.service_status == UP && item.status == OK) { // && item.status == OK
                            donorIps[SECONDARY] = item.address;
                            statusesUp = true;
                        }
                        else if (!statusesUp && item.node_type == SECONDARY && item.service_status == UP) {
                            donorIps[SECONDARY] = item.address;
                        }

                        if (primaryDonorIp) { //!donorIps[scheme]
                            donorIps[scheme] = primaryDonorIp;
                        }
                        break;
                }
            } else {
                return {
                    result: isRestore ? UNABLE_RESTORE_CODE : FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }

            api.marketplace.console.WriteLog("item.resultttttttttt statusesUp->" + item.result);
            if (item.result == AUTH_ERROR_CODE) {
                api.marketplace.console.WriteLog("in auth return->");
                return {
                    type: WARNING,
                    message: item.error
                };
            }
        }

        api.marketplace.console.WriteLog("failedNodes->" + failedNodes);
        api.marketplace.console.WriteLog("failedPrimary->" + failedPrimary);

        if (!failedNodes.length && failedPrimary.length) {
            api.marketplace.console.WriteLog("in if failedNodes = failedPrimary;");
            api.marketplace.console.WriteLog("in if failedNodes->" + failedNodes);
            api.marketplace.console.WriteLog("in if failedPrimary->" + failedPrimary);
            failedNodes = failedPrimary;
        }

        api.marketplace.console.WriteLog("failedPrimary.length->" + failedPrimary.length);
        if (isRestore && restoreMaster && failedPrimary.length) { //restoreAll

            resp = getNodeIdByIp(failedPrimary[0].address);
            if (resp.result != 0) return resp;
            api.marketplace.console.WriteLog("failedPrimary.length failedPrimary[0].scenario->");
            resp = execRecovery(failedPrimary[0].scenario, donorIps[scheme], resp.nodeid);
            if (resp.result != 0) return resp;
            resp = parseOut(resp.responses);
            if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
            failedPrimary = [];
            donorIps[scheme] = primaryDonorIp;
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
}

function execRecovery(scenario, donor, nodeid) {
    var action = "";

    if (scenario && donor) {
        action = scenario + " --donor-ip " +  donor;
    } else {
        action = exec;
    }

    api.marketplace.console.WriteLog("curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/v2.5.0/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh --mysql-user " + user + " --mysql-password " + password + action);
    return cmd({
        command: "curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/v2.5.0/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh --mysql-user " + user + " --mysql-password " + password + action,
        nodeid: nodeid || ""
    });
}

function getEnvInfo() {
    var resp;

    if (!envInfo) {
        envInfo = api.env.control.GetEnvInfo(envName, session);
    }

    return envInfo;
}

function getSlavesOnly() {
    var resp,
        slaves = [];

    resp = getSQLNodes();
    if (resp.result != 0) return resp;

    for (var i = 0, n = resp.nodes; i < n; i++) {
        api.marketplace.console.WriteLog("resp.nodes[i].address -> " + resp.nodes[i].address);
        if (resp.nodes[i].address != primaryDonorIp) {
            slaves.push({
                address: resp.nodes[i].address,
                scenario: scenario
            });
        }
    }

    api.marketplace.console.WriteLog("getSlavesOnly -> " + slaves);
    return {
        result: 0,
        nodes: slaves
    }
}

function getSQLNodes() {
    var resp,
        sqlNodes = [],
        nodes;

    resp = getEnvInfo();
    if (resp.result != 0) return resp;
    nodes = resp.nodes;

    for (var i = 0, n = nodes.length; i < n; i++) {
        if (nodes[i].nodeGroup == SQLDB) {
            sqlNodes.push(nodes[i]);
        }
    }

    return {
        result: 0,
        nodes: sqlNodes
    }
}

function getNodeGroups() {
    var envInfo,
        nodeGroups;

    envInfo = getEnvInfo();
    if (envInfo.result != 0) return envInfo;

    return {
        result: 0,
        nodeGroups: envInfo.nodeGroups
    }
}

function cmd(values) {
    var resp;

    values = values || {};

    if (values.nodeid) {
        api.marketplace.console.WriteLog("ExecCmdById->" + values.nodeid);
        resp = api.env.control.ExecCmdById(envName, session, values.nodeid, toJSON([{ command: values.command }]), true, ROOT);
    } else {
        resp = api.env.control.ExecCmdByGroup(envName, session, values.nodeGroup || SQLDB, toJSON([{ command: values.command }]), true, false, ROOT);
    }

    return resp;
}

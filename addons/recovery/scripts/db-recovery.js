var SQLDB = "sqldb",
    AUTH_ERROR_CODE = 701,
    UNABLE_RESTORE_CODE = 98,
    FAILED_CLUSTER_CODE = 99,
    RESTORE_SUCCESS = 201,
    envName = "${env.name}",
    exec = getParam('exec', ''),
    failedNodes = [],
    isMasterFailed = false,
    GALERA = "galera",
    PRIMARY = "primary",
    SECONDARY = "secondary",
    FAILED = "failed",
    FAILED_UPPER_CASE = "FAILED",
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
    additionalPrimary = "",
    scenario = "",
    scheme,
    item,
    resp;

if (!exec) isRestore = true;
exec = exec || " --diagnostic";

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
api.marketplace.console.WriteLog("failedNodes00-> " + failedNodes);
api.marketplace.console.WriteLog("isRestore-> " + isRestore);
if (isRestore) {
    if (resp.result == AUTH_ERROR_CODE) return resp;

    if (isMasterFailed) {
        resp = getSlavesOnly();
        if (resp.result != 0) return resp;

        failedNodes = resp.nodes;
        scenario = " --scenario restore_secondary_from_primary";
    }

    if (!failedNodes.length) {
        return {
            result: !isRestore ? 200 : RESTORE_SUCCESS,
            type: SUCCESS
        };
    }

    if (!scenario || !donorIps[scheme]) {
        return {
            result: UNABLE_RESTORE_CODE,
            type: SUCCESS
        }
    }

    for (var k = 0, l = failedNodes.length; k < l; k++) {
        resp = getNodeIdByIp(failedNodes[k].address);
        if (resp.result != 0) return resp;

        resp = execRecovery(failedNodes[k].scenario, donorIps[scheme], resp.nodeid, additionalPrimary);
        if (resp.result != 0) return resp;

        resp = parseOut(resp.responses, false);
        if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
    }

} else {
    return resp;
}

function parseOut(data, restoreMaster) {
    var resp,
        nodeid,
        statusesUp = false,
        primaryMasterAddress = "",
        primaryEnabledService = "",
        failedPrimary = [];

    if (scheme == SECONDARY && restoreMaster) {
        failedNodes = [];
        failedPrimary = [];
        donorIps = {};
    }

    if (data.length) {
        for (var i = 0, n = data.length; i < n; i++) {
            nodeid = data[i].nodeid;
            item = data[i].out;
            item = JSON.parse(item);

            api.marketplace.console.WriteLog("item->" + item);
            if (item.result == AUTH_ERROR_CODE) {
                return {
                    type: WARNING,
                    message: item.error,
                    result: AUTH_ERROR_CODE
                };
            }

            if (item.result == 0) {
                switch(String(scheme)) {
                    case GALERA:
                        if ((item.service_status == UP || item.status == OK) && item.galera_myisam != OK) {
                            return {
                                type: WARNING,
                                message: "There are MyISAM tables in the Galera Cluster. These tables should be converted in InnoDB type"
                            }
                        }
                        if (item.service_status == DOWN || item.status == FAILED) {
                            scenario = " --scenario restore_galera";
                            if (!donorIps[scheme]) {
                                donorIps[GALERA] = GALERA;
                            }

                            failedNodes.push({
                                address: item.address,
                                scenario: scenario
                            });

                            if (!isRestore) {
                                resp = setFailedDisplayNode(item.address);
                                if (resp.result != 0) return resp;
                            }
                        }

                        if (!isRestore && failedNodes.length) {
                            return {
                                result: FAILED_CLUSTER_CODE,
                                type: SUCCESS
                            };
                        }

                        if (item.service_status == UP && item.status == OK) {
                            resp = setFailedDisplayNode(item.address, true);
                            if (resp.result != 0) return resp;
                        }
                        break;

                    case PRIMARY:
                        if (item.node_type == SECONDARY) {
                            scenario = " --scenario restore_secondary_from_primary";
                        } else {
                            scenario = " --scenario restore_primary_from_primary";
                        }

                        if (item.service_status == DOWN || item.status == FAILED) {
                            scenario = " --scenario restore_primary_from_primary";

                            if (item.service_status == UP) {
                                if (!donorIps[scheme]) {
                                    donorIps[PRIMARY] = item.address;
                                }

                                if (item.address == "${nodes.sqldb.master.address}") {
                                    primaryMasterAddress = item.address;
                                }
                            }

                            if (!isRestore) {
                                resp = setFailedDisplayNode(item.address);
                                if (resp.result != 0) return resp;
                            }

                            if (!donorIps[scheme] && item.service_status == UP) {
                                donorIps[PRIMARY] = item.address;
                            }

                            if (item.status == FAILED) {
                                if (item.node_type == PRIMARY) {
                                    failedPrimary.push({
                                        address: item.address,
                                        scenario: scenario
                                    });
                                } else {
                                    failedNodes.push({
                                        address: item.address,
                                        scenario: scenario
                                    });
                                }
                            }
                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }
                            restoreMaster = true;
                        }

                        if (item.service_status == UP && item.status == OK) {
                            donorIps[PRIMARY] = item.address;
                            primaryMasterAddress = item.address;

                            resp = setFailedDisplayNode(item.address, true);
                            if (resp.result != 0) return resp;
                        }

                        break;

                    case SECONDARY:
                        if (item.service_status == DOWN || item.status == FAILED) {

                            if (!isRestore) {
                                resp = setFailedDisplayNode(item.address);
                                if (resp.result != 0) return resp;
                            }

                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }

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
                            } else if (item.node_type == PRIMARY) {
                                scenario = " --scenario restore_primary_from_secondary";
                                failedPrimary.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                                isMasterFailed = true;
                            } else if (item.status == FAILED) {
                                scenario = " --scenario restore_secondary_from_primary";
                                failedNodes.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                            }
                        }

                        if (item.node_type == PRIMARY) {
                            if (item.service_status == UP && item.status == OK) {
                                primaryDonorIp = item.address;
                            }
                        }

                        if (item.service_status == UP && item.status == OK) {
                            donorIps[SECONDARY] = item.address;
                            statusesUp = true;

                            resp = setFailedDisplayNode(item.address, true);
                            if (resp.result != 0) return resp;
                        }
                        else if (!statusesUp && item.node_type == SECONDARY && item.service_status == UP) {
                            donorIps[SECONDARY] = item.address;
                        }

                        if (primaryDonorIp) { //!donorIps[scheme]
                            donorIps[scheme] = primaryDonorIp;
                            continue;
                        }
                        break;
                }
            } else {
                return {
                    result: isRestore ? UNABLE_RESTORE_CODE : FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }
        }

        if (!failedNodes.length && failedPrimary.length) {
            failedNodes = failedPrimary;
        }

        if ((!scenario || !donorIps[scheme]) && failedNodes.length) {
            return {
                result: UNABLE_RESTORE_CODE,
                type: SUCCESS
            }
        }

        if (isRestore && restoreMaster && failedPrimary.length) { //restoreAll
            if (failedPrimary.length > 1) {
                primaryEnabledService = primaryMasterAddress || donorIps[scheme];
                i = failedPrimary.length;

                while (i--) {
                    if (failedPrimary[i].address != primaryEnabledService) {
                        resp = getNodeIdByIp(failedPrimary[i].address);
                        if (resp.result != 0) return resp;

                        resp = execRecovery(failedPrimary[i].scenario, primaryEnabledService, resp.nodeid);
                        if (resp.result != 0) return resp;

                        resp = parseOut(resp.responses);
                        if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;

                        if (primaryEnabledService && scheme == PRIMARY) {
                            additionalPrimary = failedPrimary[i].address;
                        }

                        if (resp.result == RESTORE_SUCCESS) {
                            failedPrimary.splice(i, 1);
                        }
                    }
                }
            }

            resp = getNodeIdByIp(failedPrimary[0].address);
            if (resp.result != 0) return resp;

            resp = execRecovery(failedPrimary[0].scenario, donorIps[scheme], resp.nodeid);
            if (resp.result != 0) return resp;
            resp = parseOut(resp.responses);
            if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;

            if (failedNodes.length) {
                i = failedNodes.length;
                while (i--) {
                    if (failedNodes[i].address == failedPrimary[0].address) {
                        failedNodes.splice(i, 1);
                        break;
                    }
                }
            }
            failedPrimary = [];
            donorIps[scheme] = primaryDonorIp;
        }

        return {
            result: !isRestore ? 200 : 201,
            type: SUCCESS
        };
    }
}

return {
    result: !isRestore ? 200 : 201,
    type: SUCCESS
};

function setFailedDisplayNode(address, removeLabelFailed) {
    var REGEXP = new RegExp('\\b - ' + FAILED + '\\b', 'gi'),
        displayName,
        resp,
        node;

    removeLabelFailed = !!removeLabelFailed;

    resp = getNodeIdByIp(address);
    if (resp.result != 0) return resp;

    resp = getNodeInfoById(resp.nodeid);
    if (resp.result != 0) return resp;
    node = resp.node;

    if (!isRestore && node.displayName.indexOf(FAILED_UPPER_CASE) != -1) return { result: 0 }

    displayName = removeLabelFailed ? node.displayName.replace(REGEXP, "") : (node.displayName + " - " + FAILED_UPPER_CASE);
    return api.env.control.SetNodeDisplayName(envName, session, node.id, displayName);
}

function getNodeInfoById(id) {
    var envInfo,
        nodes,
        node;

    envInfo = getEnvInfo();
    if (envInfo.result != 0) return envInfo;

    nodes = envInfo.nodes;

    for (var i = 0, n = nodes.length; i < n; i++) {
        if (nodes[i].id == id) {
            node = nodes[i];
            break;
        }
    }

    return {
        result: 0,
        node: node
    }
}

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

function execRecovery(scenario, donor, nodeid, additionalPrimary) {
    var action = "";

    if (scenario && donor) {
        action = scenario + " --donor-ip " +  donor;
    } else {
        action = exec;
    }

    if (additionalPrimary) {
        action += " --additional-primary " + additionalPrimary;
    }

    api.marketplace.console.WriteLog("curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/v3.0.0/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + action);
    return cmd({
        command: "curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/v3.0.0/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + action,
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

    for (var i = 0, n = resp.nodes.length; i < n; i++) {
        if (resp.nodes[i].address != primaryDonorIp) {
            slaves.push({
                address: resp.nodes[i].address,
                scenario: scenario
            });
        }
    }

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
    var envInfo;

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

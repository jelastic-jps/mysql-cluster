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
    unshift = false,
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
user = user || "$MONITOR_USER";
password = password || "$MONITOR_PSWD";

api.marketplace.console.WriteLog("debug" + 1);
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

api.marketplace.console.WriteLog("debug" + 2);

resp = execRecovery();

resp = parseOut(resp.responses);

api.marketplace.console.WriteLog("scheme->" + scheme);
api.marketplace.console.WriteLog("isRestore->" + isRestore);
api.marketplace.console.WriteLog("scenario->" + scenario);
api.marketplace.console.WriteLog("donorIps->" + donorIps);
api.marketplace.console.WriteLog("donorIps[scheme]->" + donorIps[scheme]);
api.marketplace.console.WriteLog("failedNodes->" + failedNodes);

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

    for (var k = 0, l = failedNodes.length; k < l; k++) {
        resp = getNodeIdByIp(failedNodes[k]);
        if (resp.result != 0) return resp;

        resp = execRecovery(scenario, donorIps[scheme], resp.nodeid);
        if (resp.result != 0) return resp;

        resp = parseOut(resp.responses, true);
        if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
    }

} else {
    return resp;
}

function parseOut(data, restoreAll) {
    var resp,
        nodeid;

    if (data.length) {
        for (var i = 0, n = data.length; i < n; i++) {
            nodeid = data[i].nodeid;
            item = data[i].out;
            item = JSON.parse(item);

            api.marketplace.console.WriteLog("debug" + 3);
            if (item.result == 0) {

                api.marketplace.console.WriteLog("item->" + item);
                api.marketplace.console.WriteLog("restoreAll->" + restoreAll);
                switch(String(scheme)) {
                    case GALERA:
                        if (item.galera_myisam != OK) {
                            return {
                                type: WARNING,
                                message: "There are MyISAM tables in the Galera Cluster. These tables should be converted in InnoDB type"
                            }
                        }
                        if (item.service_status == DOWN || item.status == FAILED || item.galera_size != OK) {
                            scenario = " --scenario restore_galera";
                            if (!donorIps[scheme]) {
                                donorIps[GALERA] = " --donor-ip " + GALERA;
                            }
                        };

                        //if (failedNodes.indexOf(item.address) == -1) {
                        failedNodes.push({
                            address: item.address,
                            scenario: scenario
                        });
                        //}
                        if (!isRestore) {
                            return {
                                result: FAILED_CLUSTER_CODE,
                                type: SUCCESS
                            };
                        }
                        break;

                    case PRIMARY:
                        if (item.service_status == DOWN || item.status == FAILED) {
                            scenario = " --scenario restore_primary_from_primary";

                            if (item.status == FAILED) { //&& failedNodes.indexOf(item.address) == -1
                                //failedNodes.push(item.address);
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
                            donorIps[PRIMARY] = " --donor-ip " + item.address;
                        }
                        break;

                    case SECONDARY:
                        if (item.node_type == PRIMARY && item.service_status == UP) {
                            primaryDonorIp = " --donor-ip " + item.address;
                            continue;
                        }

                        api.marketplace.console.WriteLog("debug" + 4);

                        if (item.service_status == DOWN && item.status == FAILED) {
                            if (item.node_type == PRIMARY) {
                                scenario = " --scenario restore_primary_from_secondary";
                                failedPrimary.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                            } else {
                                scenario = " --scenario restore_secondary_from_primary";
                                failedNodes.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                            }
                        }

                        api.marketplace.console.WriteLog("debug" + 5);

                        if (item.service_status == DOWN || item.status == FAILED) {
                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }
                        }

                        if (item.service_status == UP && item.status == OK) { // && item.status == OK
                            donorIps[SECONDARY] = " --donor-ip " + item.address;
                        }
                        else if (item.node_type == SECONDARY && item.service_status == UP) {
                            donorIps[SECONDARY] = " --donor-ip " + item.address;
                        }
                        api.marketplace.console.WriteLog("debug" + 6);

                        api.marketplace.console.WriteLog("failedPrimary->" + failedPrimary);
                        api.marketplace.console.WriteLog("failedNodes->" + failedNodes);
                        api.marketplace.console.WriteLog("donorIps->" + donorIps);

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

        api.marketplace.console.WriteLog("primaryDonorIp->" + primaryDonorIp);

        api.marketplace.console.WriteLog("failedPrimary.length11->" + failedPrimary.length);
        if (isRestore && restoreAll && failedPrimary.length) {
            resp = getNodeIdByIp(failedPrimary[0].address);
            api.marketplace.console.WriteLog("getNodeIdByIp resp->" + resp);
            if (resp.result != 0) return resp;
            api.marketplace.console.WriteLog("failedPrimary.length failedPrimary[0].scenario->" + failedPrimary[0].scenario);
            api.marketplace.console.WriteLog("failedPrimary.length donorIps[scheme]->" + donorIps[scheme]);
            api.marketplace.console.WriteLog("failedPrimary.length failedPrimary[0].address->" + failedPrimary[0].address);
            resp = execRecovery(failedPrimary[0].scenario, donorIps[scheme], resp.nodeid);
            api.marketplace.console.WriteLog("execRecovery resp->" + resp);
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
}

function execRecovery(scenario, donor, nodeid) {
    var action = "";

    if (scenario && donor) {
        action = scenario + donor + " --replica-password ${fn.password}";
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
        resp = api.env.control.ExecCmdById(envName, session, values.nodeid, toJSON([{ command: values.command }]), true, ROOT);
    } else {
        resp = api.env.control.ExecCmdByGroup(envName, session, values.nodeGroup || SQLDB, toJSON([{ command: values.command }]), true, false, ROOT);
    }

    return resp;
}

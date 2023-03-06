function DBRecovery() {
    const AUTH_ERROR_CODE = 701,
        UNABLE_RESTORE_CODE = 98,
        FAILED_CLUSTER_CODE = 99,
        RESTORE_SUCCESS = 201,
        XTRADB = "xtradb",
        GALERA = "galera",
        SECONDARY = "secondary",
        PRIMARY = "primary",
        FAILED_UPPER_CASE = "FAILED",
        FAILED = "failed",
        SUCCESS = "success",
        WARNING = "warning",
        ROOT = "root",
        DOWN = "down",
        UP = "up",
        OK = "ok",
        SQLDB = "sqldb",
        MyISAM_MSG = "There are MyISAM tables in the Galera Cluster. These tables should be converted in InnoDB type";

    var me = this,
        isRestore = false,
        envName = "${env.name}",
        config = {},
        nodeManager;

    nodeManager = new nodeManager();

    me.process = function() {
        let resp = me.defineRestore();
        if (resp.result != 0) return resp;

        resp = me.execRecovery();
        if (resp.result != 0) return resp;

        resp = me.parseResponse(resp.responses);
        if (resp.result == UNABLE_RESTORE_CODE) return resp;

        if (isRestore) {
            let failedPrimaries = me.getFailedPrimaries();
            let failedPrimariesByStatus = me.getFailedPrimariesByStatus();
            if (failedPrimaries.length || failedPrimariesByStatus.length) {
                if (!me.getDonorIp()) {
                    return {
                        result: UNABLE_RESTORE_CODE,
                        type: WARNING
                    };
                }

                if (failedPrimaries.length) {
                    resp = me.recoveryNodes(failedPrimaries);
                    if (resp.result != 0) return resp;
                    me.setPrimaryStatusFailed(false);
                }

                log("before getFailedPrimariesByStatus22");
                log("me.getFailedPrimariesByStatus()->" + me.getFailedPrimariesByStatus());
                resp = me.recoveryNodes(me.getFailedPrimariesByStatus());
                if (resp.result != 0) return resp;

                resp = me.getSecondariesOnly();
                if (resp.result != 0) return resp;

                me.setFailedNodes(resp.nodes, true);
                me.primaryRestored(true);
            }

            resp = me.recoveryNodes();
            if (resp.result != 0) return resp;
        } else {
            if (me.getEvent() && me.getAction()) {
                return {
                    result: 0,
                    errors: resp.result == FAILED_CLUSTER_CODE ? true : false
                };
            }
        }
        if (resp.result != 0) return resp;

        return {
            result: !isRestore ? 200 : 201,
            type: SUCCESS
        };
    };

    me.defineScheme = function() {
        const MASTER = "master",
            SLAVE = "slave";

        let resp = nodeManager.getNodeGroups();
        if (resp.result != 0) return resp;

        let nodeGroups = resp.nodeGroups;

        for (let i = 0, n = nodeGroups.length; i < n; i++) {
            if (nodeGroups[i].name == SQLDB && nodeGroups[i].cluster && nodeGroups[i].cluster.enabled) {
                if (nodeGroups[i].cluster.settings) {
                    let scheme = nodeGroups[i].cluster.settings.scheme;
                    if (scheme == SLAVE || scheme == SECONDARY) scheme = SECONDARY;
                    if (scheme == MASTER || scheme == PRIMARY) scheme = PRIMARY;
                    if (scheme == XTRADB) scheme = GALERA;
                    me.setScheme(scheme);
                    log("me.getScheme->" + me.getScheme());
                    break;
                }
            }
        }

        return { result: 0 }
    };

    me.defineRestore = function() {
        let exec = getParam('exec', '');
        let init = getParam('init', '');
        let event = getParam('event', '');

        if (!exec) isRestore = true;
        exec = exec || " --diagnostic";

        if (init) {
            me.setInitialize(true);
            let resp = me.execRecovery();
            if (resp.result != 0) return resp;
            me.setInitialize(false);

            resp = me.parseResponse(resp.responses);
            if (resp.result != 0) return resp;
        }

        me.setAction(exec);
        me.setEvent(event);
        me.setScenario();

        let resp = me.defineScheme();
        if (resp.result != 0) return resp;

        return { result: 0 };
    };

    me.getScheme = function() {
        return config.scheme;
    };

    me.setScheme = function(scheme) {
        config.scheme = scheme;
    };

    me.setScenario = function() {
        config.scenarios = {};
        config.scenarios[GALERA] = "galera";
        config.scenarios[PRIMARY] = "secondary_from_primary";
        config.scenarios[PRIMARY + "_" + PRIMARY] = "primary_from_primary";
        config.scenarios[PRIMARY + "_" + SECONDARY] = "primary_from_secondary";
        config.scenarios[SECONDARY] = "secondary_from_primary";
    };

    me.getScenario = function(scenario) {
        return config.scenarios[scenario];
    };

    me.getInitialize = function() {
        return config.initialize || false;
    };

    me.setInitialize = function(init) {
        config.initialize = init;
    };

    me.getEvent = function() {
        return config.event || false;
    };

    me.setEvent = function(event) {
        config.event = event;
    };

    me.getAction = function() {
        return config.action;
    };

    me.setAction = function(action) {
        config.action = action;
    };

    me.getFailedNodes = function() {
        return config.failedNodes || [];
    };

    me.setFailedNodes = function(node, updateValue) {
        if (updateValue) {
            config.failedNodes = node;
        } else {
            config.failedNodes = config.failedNodes || [];
            node ? config.failedNodes.push(node) : config.failedNodes = [];
        }
    };

    me.getFailedPrimaries = function() {
        return config.failedPrimaries || [];
    };

    me.setFailedPrimaries = function(node) {
        config.failedPrimaries = config.failedPrimaries || [];
        node ? config.failedPrimaries.push(node) : config.failedPrimaries = [];
    };

    me.setFailedPrimariesByStatus = function(node) {
        config.failedPrimariesByStatus = config.failedPrimariesByStatus || [];
        node ? config.failedPrimariesByStatus.push(node) : config.failedPrimariesByStatus = [];
    };

    me.getFailedPrimariesByStatus = function() {
        return config.failedPrimariesByStatus || [];
    };

    me.primaryRestored = function(restored) {
        if (restored) {
            config.primaryRestored = restored;
        }
        return config.primaryRestored || false;
    };

    me.setPrimaryDonor = function(primary) {
        config.primaryDonor = primary;
    };

    me.getPrimaryDonor = function() {
        return config.primaryDonor || "";
    };

    me.getAdditionalPrimary = function() {
        return config.additionalPrimary || "";
    };

    me.setAdditionalPrimary = function(primary) {
        config.additionalPrimary = primary;
    };

    me.getDonorIp = function() {
        return config.donorIp;
    };

    me.setDonorIp = function(donor) {
        config.donorIp = donor;
    };

    me.getPrimaryStatusFailed = function() {
        return config.primaryStatus || false;
    };

    me.setPrimaryStatusFailed = function(value) {
        config.primaryStatus = value;
    };

    me.parseResponse = function parseResponse(response) {
        let resp;

        me.setFailedPrimariesByStatus();
        me.setFailedPrimaries();
        me.setFailedNodes();

        for (let i = 0, n = response.length; i < n; i++) {
            if (response[i] && response[i].out) {
                let item = response[i].out;
                item = JSON.parse(item);
                api.marketplace.console.WriteLog("item->" + item);

                if (item.result == AUTH_ERROR_CODE) {
                    return {
                        type: WARNING,
                        message: item.error,
                        result: AUTH_ERROR_CODE
                    };
                }

                if (!item.node_type) {
                    if (!isRestore) {
                        let resp = nodeManager.setFailedDisplayNode(item.address);
                        if (resp.result != 0) return resp;
                        continue;
                    }
                }

                if (item.result == 0) {
                    switch (String(me.getScheme())) {
                        case GALERA:
                            resp = me.checkGalera(item);
                            if (resp.result != 0) return resp;
                            break;

                        case PRIMARY:
                            resp = me.checkPrimary(item);
                            if (resp.result != 0) return resp;
                            break;

                        case SECONDARY:
                            resp = me.checkSecondary(item);
                            if (resp.result != 0) return resp;
                            break;
                    }
                } else {
                    return {
                        result: isRestore ? UNABLE_RESTORE_CODE : FAILED_CLUSTER_CODE,
                        type: WARNING
                    };
                }
            }
        }

        if (me.getPrimaryStatusFailed() && isRestore) {
            log("in newww1");
            return {
                result: UNABLE_RESTORE_CODE,
                type: WARNING
            }
        }

        return { result: 0 }
    };

    me.checkGalera = function checkGalera(item) {
        if ((item.service_status == UP || item.status == OK) && item.galera_myisam != OK) {
            return {
                type: WARNING,
                message: MyISAM_MSG
            }
        }

        if (item.service_status == DOWN || item.status == FAILED) {
            if (!me.getDonorIp()) {
                me.setDonorIp(GALERA);
            }

            me.setFailedNodes({
                address: item.address,
                scenario: me.getScenario(GALERA)
            });

            if (!isRestore) {
                let resp = nodeManager.setFailedDisplayNode(item.address);
                if (resp.result != 0) return resp;
            }
        }

        if (!isRestore && me.getFailedNodes().length) {
            return {
                result: FAILED_CLUSTER_CODE,
                type: WARNING
            };
        }

        if (item.service_status == UP && item.status == OK) {
            let resp = nodeManager.setFailedDisplayNode(item.address, true);
            if (resp.result != 0) return resp;
        }

        return {
            result: 0
        }
    };

    me.checkPrimary = function(item) {
        let resp, setFailedLabel = false;

        if (item.service_status == DOWN || item.status == FAILED) {
            if (item.service_status == UP) {
                if (!me.getDonorIp()) {
                    me.setDonorIp(item.address);
                }

                if (item.address == "${nodes.sqldb.master.address}") {
                    me.setPrimaryDonor(item.address);
                }
            }

            if (!isRestore && item.status == FAILED && item.service_status == DOWN) {
                resp = nodeManager.setFailedDisplayNode(item.address);
                if (resp.result != 0) return resp;
                setFailedLabel = true;

                return {
                    result: FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }

            if (item.status == FAILED) {
                if (!setFailedLabel) {
                    resp = nodeManager.setFailedDisplayNode(item.address);
                    if (resp.result != 0) return resp;
                }

                if (item.node_type == PRIMARY) {
                    if (item.service_status == DOWN) {
                        me.setFailedPrimaries({
                            address: item.address
                        });
                    } else {
                        me.setFailedPrimariesByStatus({
                            address: item.address
                        });
                    }
                } else {
                    me.setFailedNodes({
                        address: item.address
                    });
                }

                if (!isRestore) {
                    return {
                        result: FAILED_CLUSTER_CODE,
                        type: WARNING
                    };
                }

                me.setPrimaryStatusFailed(true);
            }
        }

        if (item.service_status == UP && item.status == OK) {
            if (item.node_type == PRIMARY) {
                me.setDonorIp(item.address);
            } else {
                if (!me.getDonorIp()) {
                    me.setDonorIp(item.address);
                }
            }

            resp = nodeManager.setFailedDisplayNode(item.address, true);
            if (resp.result != 0) return resp;
            me.setPrimaryStatusFailed(false);
        }

        if (item.node_type == PRIMARY) {
            if (item.address == "${nodes.sqldb.master.address}") {
                me.setPrimaryDonor(me.getPrimaryDonor() || item.address)
            } else {
                me.setAdditionalPrimary(item.address);
            }
        }

        log("me.getDonorIp()->" + me.getDonorIp());
        return {
            result: 0
        }
    };

    me.checkSecondary = function(item) {
        let resp;

        if (item.service_status == DOWN || item.status == FAILED) {
            if (!isRestore) {
                resp = nodeManager.setFailedDisplayNode(item.address);
                if (resp.result != 0) return resp;
                return {
                    result: FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }

            if (item.node_type == PRIMARY) {
                me.setFailedPrimaries({
                    address: item.address,
                    scenario: me.getScenario(PRIMARY + "_" + SECONDARY)
                });
            } else {
                me.setFailedNodes({
                    address: item.address,
                    scenario: me.getScenario(SECONDARY)
                });
            }
        }

        if (item.service_status == UP && item.status == OK) {
            if (item.node_type == PRIMARY) {
                me.setPrimaryDonor(item.address);
            }

            me.setDonorIp(item.address);
            resp = nodeManager.setFailedDisplayNode(item.address, true);
            if (resp.result != 0) return resp;
        } else if (item.node_type == SECONDARY && item.service_status == UP) {
            me.setDonorIp(item.address);
        }

        if (me.getPrimaryDonor()) {
            me.setDonorIp(me.getPrimaryDonor());
        }

        return {
            result: 0
        }
    };

    me.recoveryNodes = function recoveryNodes(nodes) {
        let failedNodes = nodes || me.getFailedNodes();

        if (failedNodes.length) {
            for (let i = 0, n = failedNodes.length; i < n; i++) {
                let resp = nodeManager.getNodeIdByIp(failedNodes[i].address);
                if (resp.result != 0) return resp;

                resp = me.execRecovery({ nodeid: resp.nodeid });
                if (resp.result != 0) return resp;

                resp = me.parseResponse(resp.responses);
                if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
            }

            log("diagnost");
            let resp = me.execRecovery({ diagnostic: true });
            if (resp.result != 0) return resp;

            resp = me.parseResponse(resp.responses);
            if (resp.result != 0) return resp;
        }

        return  { result: 0 }
    };

    me.execRecovery = function(values) {
        values = values || {};
        log("values->" + values);
        api.marketplace.console.WriteLog("nodeid->" + values.nodeid);
        api.marketplace.console.WriteLog("curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/stage-addon/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + me.formatRecoveryAction(values));
        return nodeManager.cmd({
            command: "curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/stage-addon/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + me.formatRecoveryAction(values),
            nodeid: values.nodeid || ""
        });
    };

    me.formatRecoveryAction = function(values) {
        let scenario = me.getScenario(me.getScheme());
        let donor = me.getDonorIp();
        let action = "";

        if (me.getInitialize()) {
            return action = "init";
        }

        if (values.diagnostic) {
            return " --diagnostic";
        }

        if (!me.primaryRestored() && (me.getFailedPrimaries().length || me.getFailedPrimariesByStatus().length)) {
            scenario = me.getScenario(PRIMARY + "_" + ((me.getScheme() == SECONDARY) ? SECONDARY : PRIMARY));
        } else {
            if (me.getAdditionalPrimary()) {
                donor = me.getPrimaryDonor() + " --additional-primary " + me.getAdditionalPrimary();
            }
        }

        if (scenario && donor) {
            action = "--scenario restore_" + scenario + " --donor-ip " + donor;
        } else {
            action = me.getAction();
        }

        return action;
    };

    me.getSecondariesOnly = function() {
        let secondaries = [];

        let resp = nodeManager.getSQLNodes();
        if (resp.result != 0) return resp;

        for (let i = 0, n = resp.nodes.length; i < n; i++) {
            if (resp.nodes[i].address != me.getPrimaryDonor() && resp.nodes[i].address != me.getAdditionalPrimary()) {
                secondaries.push({
                    address: resp.nodes[i].address
                });
            }
        }

        return {
            result: 0,
            nodes: secondaries
        }
    };

    function nodeManager() {
        var me = this,
            envInfo;

        me.getEnvInfo = function() {
            var resp;

            if (!envInfo) {
                envInfo = api.env.control.GetEnvInfo(envName, session);
            }

            return envInfo;
        };

        me.getNodeGroups = function() {
            var envInfo;

            envInfo = this.getEnvInfo();
            if (envInfo.result != 0) return envInfo;

            return {
                result: 0,
                nodeGroups: envInfo.nodeGroups
            }
        };

        me.getSQLNodes = function() {
            var resp,
                sqlNodes = [],
                nodes;

            resp = this.getEnvInfo();
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
        };

        me.getNodeIdByIp = function(address) {
            var envInfo,
                nodes,
                id = "";

            envInfo = me.getEnvInfo();
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

        me.getNodeInfoById = function(id) {
            var envInfo,
                nodes,
                node;

            envInfo = me.getEnvInfo();
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
        };

        me.setFailedDisplayNode = function(address, removeLabelFailed) {
            var REGEXP = new RegExp('\\b - ' + FAILED + '\\b', 'gi'),
                displayName,
                resp,
                node;

            removeLabelFailed = !!removeLabelFailed;

            resp = me.getNodeIdByIp(address);
            if (resp.result != 0) return resp;

            resp = me.getNodeInfoById(resp.nodeid);
            if (resp.result != 0) return resp;
            node = resp.node;

            node.displayName = node.displayName || ("Node ID: " + node.id);

            if (!removeLabelFailed && node.displayName.indexOf(FAILED_UPPER_CASE) != -1) return { result: 0 }

            displayName = removeLabelFailed ? node.displayName.replace(REGEXP, "") : (node.displayName + " - " + FAILED_UPPER_CASE);
            return api.env.control.SetNodeDisplayName(envName, session, node.id, displayName);
        };

        me.cmd = function(values) {
            let resp;

            values = values || {};

            if (values.nodeid) {
                resp = api.env.control.ExecCmdById(envName, session, values.nodeid, toJSON([{ command: values.command }]), true, ROOT);
            } else {
                resp = api.env.control.ExecCmdByGroup(envName, session, values.nodeGroup || SQLDB, toJSON([{ command: values.command }]), true, false, ROOT);
            }

            return resp;
        }
    };

    function log(message) {
        if (api.marketplace && jelastic.marketplace.console && message) {
            return api.marketplace.console.WriteLog(appid, session, message);
        }

        return { result : 0 };
    }
};

return new DBRecovery().process();

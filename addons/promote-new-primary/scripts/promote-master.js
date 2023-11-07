//@reg(envName, token, uid)
function promoteNewPrimary() {
    let envInfo;
    let ROOT = "root";
    let PROXY = "proxy";
    let SQLDB = "sqldb";
    let PRIMARY = "Primary";
    let SECONDARY = "secondary";
    let FAILED = "failed";
    let NOT_RUNNING = 4110;
    let Response = com.hivext.api.Response;
    let TMP_FILE = "/var/lib/jelastic/promotePrimary";
    let session = getParam("session", "");
    let force = getParam("force", false);
    let UNKNOWN_ERROR = 99;
    let CLUSTER_FAILED = 98;
    let MySQL_FAILED = 97;
    let GET_ENVS_FAILED = 96;
    let WARNING = "warning";
    let containerEnvs = {};
    let base = api.data.base;
    let tableName = "promotePrimary";
    let END_POINT = "EditEndpoint";
    let dbPromoteData = "";
    let APP_ID_PROXY = "promote-new-primary-with-proxysql";
    let APP_ID_WITHOUT_PROXY = "promote-new-primary-without-proxysql";

    this.run = function() {
        this.log("start");
        let resp = this.defineAddonType();
        this.log("defineAddonType resp->" + resp);
        if (resp.result != 0) return resp;

        //PROXY
        if (this.getAddOnType()) {
            resp = this.auth();
            if (resp.result != 0) return resp;
        } else {
            //NO PROXY
            let resp = this.isProcessRunning();
            if (resp.result != 0) return resp;
            if (resp.isRunning) return {result: 0}

            //NO PROXY
            // resp = this.checkAvailability();
            // if (resp.result != MySQL_FAILED || resp.result != 0) {
            //     return resp;
            // }
        }

        resp = this.DefinePrimaryNode();
        this.log("DefinePrimaryNode resp->" + resp);
        if (resp.result != 0) return resp;

        resp = this.checkAvailability();
        this.log("checkAvailability resp->" + resp);
        if (resp.result != MySQL_FAILED && resp.result != 0) {
            return resp;
        }

        resp = this.newPrimaryOnProxy();
        this.log("newPrimaryOnProxy resp->" + resp);
        if (resp.result != 0) return resp;

        resp = this.promoteNewSQLPrimary();
        this.log("promoteNewSQLPrimary resp->" + resp);
        if (resp.result != 0) return resp;

        resp = this.setDomains();
        if (resp.result != 0) return resp;

        resp = this.EditEndPoint();
        if (resp.result != 0) return resp;

        resp = this.setContainerVar();
        this.log("setContainerVar resp->" + resp);
        if (resp.result != 0) return resp;

        resp = this.setNewMasterNode();
        if (resp.result != 0) return resp;
        //SAME DONE

        resp = this.restoreNodes();
        this.log("restoreNodes resp" + resp);
        if (resp.result != 0) return resp;

        resp = this.addNode();
        this.log("addNode resp" + resp);
        if (resp.result != 0) return resp;

        resp = this.removeFailedPrimary();
        this.log("removeFailedPrimary resp" + resp);
        if (resp.result != 0) return resp;

        if (!this.getAddOnType()) {
            resp = this.addIteration(true);
            if (resp.result != 0) return resp;
            return this.setIsRunningStatus(false);
        } else {
            let nodeGroup = this.getAddOnType() ? PROXY : SQLDB;

            return this.cmdByGroup("rm -rf " + TMP_FILE, nodeGroup, 3);
        }

        return { result: 0 }
    };

    this.checkAvailability = function(skipIteration) {
        let command = "mysqladmin -u" + containerEnvs["REPLICA_USER"] + " -p" + containerEnvs["REPLICA_PSWD"] +  " ping";
        let resp = this.cmdById(this.getPrimaryNode().id, command, 10);

        this.log("this.checkAvailabilit resp->" + resp);
        if (skipIteration) return resp;
        if (force == "false") force = false;
        if (force || resp.result == 4109 ||
            (resp.responses && resp.responses[0].result == 4109) ||
            (resp.responses[0].out && resp.responses[0].out.indexOf("is alive") == -1)) {
            if (!this.getAddOnType()) {
                resp = this.addIteration();
                if (resp.result != 0) return resp;
            }

            if ((resp.iterator >= primary_idle_time / 10) || force) {
                if (!this.getAddOnType()) {
                    resp = this.setIsRunningStatus(true);
                    if (resp.result != 0) return resp;
                    return {
                        result: MySQL_FAILED
                    }
                }
            }
        }

        if (resp.responses[0].error && resp.responses[0].error.indexOf("No route to host") != -1) {
            this.setFailedPrimary(this.getPrimaryNode());
            this.setNoRoute(true);
            this.log("checkAvailability this.getFailedPrimary ->" + this.getFailedPrimary());
            return {
                result: MySQL_FAILED
            }
        }

        return { result: 0 }
    };

    this.isProcessRunning = function() {
        let resp = this.getPromoteData();
        if (resp.result != 0) return resp;

        if (resp.data && resp.data.isRunning)
            return {
                result: 0,
                isRunning: true
            };

        return { result: 0, isRunning: false }
    };

    this.setDomains = function() {
        let resp = api.env.binder.GetDomains({
            envName: envName,
            session: session
        });
        if (resp.result != 0) return resp;

        let data = JSON.parse(resp);
        let nodeWithDomain = data.nodes.find(node => node.domains.includes("primarydb"));
        if (nodeWithDomain) {
            resp = api.env.binder.RemoveDomains({
                envName: envName,
                session: session,
                domains: "primarydb",
                nodeId: nodeWithDomain.nodeId
            });
            if (resp.result != 0) return resp;
        }
        return api.env.binder.AddDomains({
            envName: envName,
            domains: 'primarydb',
            nodeId: this.getNewPrimaryNode().id
        });
    };

    this.EditEndPoint = function() {
        //check if method is available
        let resp = api.dev.scripting.Eval("ext", session, END_POINT, {});
        if (resp.result != 3) return { result: 0 }

        resp = this.getEnvInfo();
        if (resp.result != 0) return resp;

        let nodes = resp.nodes, node;
        for (let i = 0, n = nodes.length; i < n; i++) {
            node = nodes[i];
            if (node.endpoints) {
                for (let k = 0, l = node.endpoints.length; k < l; k++) {
                    if (node.endpoints[k].name == "PrimaryDB") {
                        return api.dev.scripting.Eval("ext", session, END_POINT, {
                            envName: envName,
                            id: node.endpoints[k].id,
                            name: node.endpoints[k].name,
                            privatePort: node.endpoints[k].privatePort,
                            protocol: node.endpoints[k].protocol,
                            nodeId: this.getNewPrimaryNode().id
                        });
                        if (resp.result == 1702) return {result: 0};
                        if (resp.result != 0) return resp;
                    }
                }
            }
        }

        return { result: 0 }
    };

    this.setNewMasterNode = function() {
        if (api.env.control.SetMasterNode) {
            this.log("API api.env.control.SetMasterNode");
            return api.env.control.SetMasterNode({
                envName: envName,
                nodeId: this.getNewPrimaryNode().id,
                ignoreErrors: true
            });
        } else {
            this.log("Eval SetMasterNode");
            let resp = jelastic.dev.scripting.Eval("ext", session, "api.env.control.SetMasterNode", {
                envName: envName,
                nodeId: this.getNewPrimaryNode().id
            });
            if (resp.result == 1702) return {result: 0};
            if (resp.result != 0) return resp;
        }

        return { result: 0 }
    };

    this.DefinePrimaryNode = function() {
        this.log("getContainerEnvs start->");
        let resp = this.getContainerEnvs();
        this.log("getContainerEnvs resp->" + resp);
        if (resp.result != 0) return resp;

        containerEnvs = resp.object;

        if (containerEnvs["PRIMARY_IP"]) {
            resp = this.getNodeByAddress(containerEnvs["PRIMARY_IP"]);
            if (resp.result != 0) return resp;
            this.setPrimaryNode(resp.node);
        }

        return {
            result : 0,
            node: this.getPrimaryNode()
        }
    };

    this.getContainerEnvs = function() {
        let secondaryNodeId = "";
        let nodeId;
        let resp = this.getEnvInfo();
        if (resp.result != 0) return resp;

        for (let i = 0, n = resp.nodes.length; i < n; i++) {
            if (resp.nodes[i].nodeGroup == SQLDB) {
                if (resp.nodes[i].ismaster) {
                    nodeId = resp.nodes[i].id;
                } else {
                    secondaryNodeId = secondaryNodeId || resp.nodes[i].id;
                }
            }
        }

        resp = api.environment.control.GetContainerEnvVars(envName, session, nodeId);
        if (resp.result == UNKNOWN_ERROR && resp.error.indexOf("No route to host") != -1) {
            return api.environment.control.GetContainerEnvVars(envName, session, secondaryNodeId);
        }

        return (resp.result == 0) ? resp : {result: GET_ENVS_FAILED, error: "Can not get environment variables"};
    };

    this.getPromoteData = function() {
        let resp;
        if (!dbPromoteData) {
            resp = base.GetObjectsByCriteria(tableName, {envName: envName}, 0, 1);
            if (resp.result != 0) return resp;
            dbPromoteData = resp.objects[0];

            if (!dbPromoteData) {
                resp = base.CreateObject(tableName, {
                    envName: envName,
                    isRunning: false,
                    count: 1,
                    primary_idle_iterations: 0
                });
                if (resp.result != 0) return resp;
            }

            resp = base.GetObjectsByCriteria(tableName, {envName: envName}, 0, 1);
            if (resp.result != 0) return resp;
            dbPromoteData = resp.objects[0];
        }

        return { result: 0, data: dbPromoteData }
    };

    this.setIsRunningStatus = function(value) {
        let resp = this.getPromoteData();
        if (resp.result != 0) return resp;

        let data = resp.data;
        if (data.length === 0) {
            resp = base.CreateObject(tableName, { envName: envName, isRunning: value, count: 1 });
        } else {
            resp = base.SetProperty(appid, session, tableName, data.id, "isRunning", value);
            if (resp.result != 0) return resp;
            let count = parseInt(data.count, 10) + 1;
            resp = base.SetProperty(appid, session, tableName, data.id, "count", count);
        }
        if (resp.result != 0) return resp;


        return { result: 0 }
    };

    this.log = function(message) {
        api.marketplace.console.WriteLog(appid, session, message);
    };

    this.addIteration = function(reset) {
        let resp = this.getPromoteData();
        if (resp.result != 0) return resp;

        let data = resp.data;
        let newIterator = parseInt(data.primary_idle_iterations) + 1;
        if (reset) newIterator = 0;

        resp = base.SetProperty(appid, session, tableName, data.id, "primary_idle_iterations", newIterator);
        if (resp.result != 0) return resp;

        return {
            result: 0,
            iterator: newIterator
        }
    };

    this.defineAddonType = function() {
        let resp = api.marketplace.app.GetAddonList({
            search: {},
            envName: envName,
            session: session
        });
        if (resp.result != 0) return resp;
        for (let i = 0, n = resp.apps.length; i < n; i++) {
            if (resp.apps[i].isInstalled) {
                if (resp.apps[i].app_id == APP_ID_PROXY) {
                    this.setAddOnType(true);
                    break;
                } else if (resp.apps[i].app_id == APP_ID_WITHOUT_PROXY) {
                    this.setAddOnType(false);
                    break;
                }
            }
        }

        return { result: 0 }
    };

    this.auth = function() {
        this.log("auth start");
        if (!session && String(getParam("token", "")).replace(/\s/g, "") != "RCmfxWady8") {
            return {
                result: Response.PERMISSION_DENIED,
                error: "wrong token",
                type:"error",
                message:"Token [" + token + "] does not match",
                response: { result: Response.PERMISSION_DENIED }
            };
        }

        this.log("auth before touch file");
        return this.cmdByGroup("touch " + TMP_FILE, PROXY, 3, true);
    };

    this.setContainerVar = function() {
        let resp;
        let aliveSQLNodes;

        if (this.getFailedPrimary()) {
            resp = this.getAvailableSQL();
            if (resp.result != 0) return resp;

            aliveSQLNodes = resp.nodes;

            for (let i = 0, n = aliveSQLNodes.length; i < n; i++) {
                resp = api.environment.control.AddContainerEnvVars({
                    envName: envName,
                    session: session,
                    nodeId: aliveSQLNodes[i].id,
                    vars: {
                        PRIMARY_IP: this.getNewPrimaryNode().address
                    }
                });
                if (resp.result != 0) return resp;
            }

            return { result: 0 }
        }

        return api.environment.control.AddContainerEnvVars({
            envName: envName,
            session: session,
            nodeGroup: SQLDB,
            vars: {
                PRIMARY_IP: this.getNewPrimaryNode().address
            }
        });
    };

    this.getAvailableSQL = function() {
        let availableNodes = [];

        let resp = this.getNodesByGroup(SQLDB);
        if (resp.result != 0) return resp;
        let nodes = resp.nodes;

        for (let i = 0, n = nodes.length; i < n; i++) {
            if (nodes[i].address != this.getFailedPrimary().address) {
                availableNodes.push(nodes[i]);
            }
        }

        return {
            result: 0,
            nodes: availableNodes
        }
    };

    this.diagnosticNodes = function() {
        let clusterUp = false;
        let command = "curl -fsSL 'https://github.com/jelastic-jps/mysql-cluster/raw/master/addons/recovery/scripts/db-recovery.sh' -o /tmp/db_recovery.sh\n" +
            "bash /tmp/db_recovery.sh --diagnostic"
        let resp = this.cmdByGroup(command, SQLDB, 60, true);
        this.log("this.diagnosticNodes resp->" + resp);
        if (resp.result != 0) return resp;

        let responses = resp.responses, out;
        let nodes = [];

        this.log("this.diagnosticNodes responses->" + responses);
        if (responses.length) {
            for (let i = 0, n = responses.length; i < n; i++) {
                out = JSON.parse(responses[i].out);
                if (out.result == 0) {
                    nodes.push({
                        address: out.address,
                        id: responses[i].nodeid,
                        type: out.node_type
                    });

                    if (out.service_status == "up" || out.status == "ok") {
                        clusterUp = true;
                    }
                }
            }

            if (nodes.length) {
                this.setParsedNodes(nodes);
            }
        }

        if (!clusterUp) {
            return {
                result: CLUSTER_FAILED,
                type: WARNING,
                message: "Cluster failed. Unable promote new primary",
            }
        }

        return { result: 0, nodes: nodes};
    };

    this.getEnvInfo = function(reset) {
        if (!envInfo || reset) {
            envInfo = api.env.control.GetEnvInfo(envName, session);
        }

        return envInfo;
    };

    this.getNodeByAddress = function(address) {
        let node;
        let resp = this.getEnvInfo();

        if (resp.result != 0) return resp;

        for (let i = 0, n = resp.nodes.length; i < n; i++) {
            if (resp.nodes[i].address == address) {
                node = resp.nodes[i];
            }
        }

        return {
            result: 0,
            node: node
        }
    };

    this.getAddOnType = function() {
        return this.isProxy;
    };

    this.setAddOnType = function(value) {
        this.isProxy = value;
    };

    this.getNewPrimaryNode = function() {
        return this.newPrimaryNode;
    };

    this.setNewPrimaryNode = function(node) {
        this.newPrimaryNode = node;
    };

    this.getPrimaryNode = function() {
        return this.primaryNode;
    };

    this.setPrimaryNode = function(node) {
        this.primaryNode = node;
    };

    this.getFailedPrimary = function() {
        return this.failedPrimary;
    };

    this.setFailedPrimary = function(node) {
        this.failedPrimary = node;
    };

    this.setNoRoute = function(value) {
        this.noRoute = value;
    };

    this.getNoRoute = function() {
        return this.noRoute;
    };

    this.getAvailableProxy = function() {
        return this.availableProxy || "";
    };

    this.setAvailableProxy = function(nodeid) {
        this.availableProxy = nodeid;
    };

    this.checkNodesAvailability = function(nodeGroup) {
        let nodeid;

        if (this.getAvailableProxy()) {
            return {
                result: 0,
                nodeid: this.getAvailableProxy()
            }
        }

        let resp = this.cmdByGroup("echo 1", nodeGroup, null, true);
        if (resp.result == NOT_RUNNING ||
            (resp.responses[0] && resp.responses[0].error && resp.responses[0].error.indexOf("No route to host"))) {
            let nodeResp;
            for (let i = 0, n = resp.responses.length; i < n; i++) {
                nodeResp = resp.responses[i];
                if (nodeResp.result == 0) {
                    nodeid = nodeResp.nodeid;
                    this.setAvailableProxy(nodeResp.nodeid);
                    break;
                }
            }
            if (resp.result != 0 && resp.result != NOT_RUNNING) return resp;

            return {
                result: 0,
                nodeid: this.getAvailableProxy()
            }
        }
    };

    this.getParsedNodes = function() {
        return this.parsedNodes;
    };

    this.setParsedNodes = function(nodes) {
        this.parsedNodes = nodes;
    };

    this.getNodesByGroup = function(group, reset) {
        let groupNodes = [];

        let resp = this.getEnvInfo(reset);
        if (resp.result != 0) return resp;

        let nodes = resp.nodes;

        for (let i = 0, n = nodes.length; i < n; i++) {
            if (nodes[i].nodeGroup == group) {
                groupNodes.push(nodes[i]);
            }
        }

        return { result: 0, nodes: groupNodes }
    };

    this.getSQLNodeById = function(nodeid, reset) {
        let node;
        let resp = this.getNodesByGroup(SQLDB, reset);
        if (resp.result != 0) return resp;

        if (resp.nodes) {
            for (let i = 0, n = resp.nodes.length; i < n; i++) {
                if (resp.nodes[i].id == nodeid) {
                    node = resp.nodes[i];
                }
            }
        }

        return {
            result: 0,
            node: node
        }
    };

    this.newPrimaryOnProxy = function() {
        let alreadySetNewPrimary = false;
        let resp = this.diagnosticNodes();
        this.log("diagnosticNodes resp->" + resp);
        if (resp.result != 0) return resp;

        // let nodes = this.getParsedNodes();
        resp = this.getNodesByGroup(SQLDB);

        this.log("newPrimaryOnProxy getNodesByGroup resp->" + resp);
        if (resp && resp.nodes) {
            let node;
            for (let i = 0, n = resp.nodes.length; i < n; i++) {
                node = resp.nodes[i];
                this.log("node->" + node);
                if (node) {
                    //if (nodes[i].type == "secondary" && !alreadySetNewPrimary) {
                    if (node.address != containerEnvs["PRIMARY_IP"] && !alreadySetNewPrimary){
                        this.setNewPrimaryNode(node);
                        alreadySetNewPrimary = true;
                    }
                    // if (nodes[i].type == "primary") {
                    if (node.address == containerEnvs["PRIMARY_IP"]){
                        resp = api.env.control.SetNodeDisplayName(envName, session, node.id, PRIMARY + " - " + FAILED);
                        this.log("SetNodeDisplayName resp-> " + resp);
                        if (resp.result != 0) return resp;

                        resp = this.getSQLNodeById(node.id);
                        this.log("getSQLNodeById resp->" + resp);
                        if (resp.result != 0) return resp;

                        if (resp.node) {
                            this.setFailedPrimary(resp.node);
                        }
                        this.log("end address == containerEnvs[->");
                    }
                this.log("end if node->");
                }
                this.log("end for circle->");
            }
            this.log("before if (this.getAddOnType()) {");
            if (this.getAddOnType()) {
                this.log("in if (this.getAddOnType()) {");
                let command = "bash /usr/local/sbin/jcm.sh newPrimary --server=node" + this.getNewPrimaryNode().id;
                return this.cmdByGroup(command, PROXY, 20, true);
            }
        }
        this.log("newPrimaryOnProxy before return->");

        return { result: 0 }
    };

    this.promoteNewSQLPrimary = function() {
        let newPrimary = this.getNewPrimaryNode();

        let command = "curl -fsSL 'https://github.com/jelastic-jps/mysql-cluster/raw/master/addons/recovery/scripts/db-recovery.sh' -o /tmp/db_recovery.sh\n" +
            "bash /tmp/db_recovery.sh --scenario promote_new_primary";
        let resp = this.cmdById(newPrimary.id, command);
        if (resp.result != 0) return resp;

        return api.env.control.SetNodeDisplayName(envName, session, newPrimary.id, PRIMARY);
    };

    this.restoreNodes = function() {
        // let nodes = this.getParsedNodes();
        let newPrimary = this.getNewPrimaryNode();

        let resp = this.getAvailableSQL(SQLDB);
        if (resp.result != 0) return resp;
        let nodes = resp.nodes;
        // node.address != containerEnvs["PRIMARY_IP"]
        this.log("this.restoreNodes nodes ->" + nodes);
        let command = "bash /tmp/db_recovery.sh --scenario restore_secondary_from_primary --donor-ip " + newPrimary.address;
        for (let i = 0, n = nodes.length; i < n; i++) {
            // if (nodes[i].id != newPrimary.id && nodes[i].type == SECONDARY) {
            if (nodes[i].id != newPrimary.id && nodes[i].address != containerEnvs["PRIMARY_IP"]) {
                let resp = this.cmdById(nodes[i].id, command);
                if (resp.result != 0) return resp;
            }
        }

        return { result: 0 }
    };

    this.addNode = function() {
        let envInfo = this.getEnvInfo();
        if (envInfo.result != 0) return envInfo;

        let nodes = [];
        let nodeGroups = [], node, count;

        for (let i = 0, n = envInfo.nodes.length; i < n; i++) {
            node = envInfo.nodes[i];

            if (nodeGroups.indexOf(String(node.nodeGroup)) == -1) {
                nodeGroups.push(String(node.nodeGroup));
                let resp = this.getNodesByGroup(node.nodeGroup);
                if (resp.result != 0) return resp;

                count = resp.nodes.length;
                if (node.nodeGroup == SQLDB) count += 1;

                nodes.push({
                    flexibleCloudlets: node.flexibleCloudlets,
                    fixedCloudlets: node.fixedCloudlets,
                    nodeType: node.nodeType,
                    nodeGroup: node.nodeGroup,
                    count: count
                });
            }
        }

        return api.env.control.ChangeTopology({
            envName: envName,
            session: session,
            env: {
                region: envInfo.env.hostGroup.uniqueName,
                sslstate: envInfo.env.sslstate
            },
            nodes: nodes
        });
    };

    this.removeFailedPrimary = function() {
        let failedPrimary = this.getFailedPrimary();

        let resp = this.getSQLNodeById(failedPrimary.id, true);
        if (resp.result != 0) return resp;

        if (failedPrimary && resp.node && !resp.node.ismaster) {
            return api.env.control.RemoveNode(envName, session, failedPrimary.id);
        }

        return { result: 0 }
    };

    this.cmdByGroup = function(command, nodeGroup, timeout, test) {
        if (timeout) {
            command = "timeout " + timeout + "s bash -c \"" + command + "\"";
        }

        if (nodeGroup == PROXY && !test) {
            let resp = this.checkNodesAvailability(PROXY);
            if (resp && resp.nodeid) {
                return this.cmdById(resp.nodeid, command);
            }
        }

        if (nodeGroup == SQLDB && test) {
            this.log("this.getNoRoute->" + this.getNoRoute());
            if (this.getNoRoute()) {
                let resp = this.getAvailableSQL();
                this.log("this.getAvailableSQL resp->" + resp);
                if (resp.result != 0) return resp;

                let responses = [];
                for (let i = 0, n = resp.nodes.length; i < n; i++) {
                    if (resp.nodes[i].id) {
                        resp = this.cmdById(resp.nodes[i].id, command);
                        this.log("in cmdByGroup cmdById resp->" + resp);
// {"result":0,"responses":[{"result":0,"errOut":"","nodeid":8482,"exitStatus":0,"out":"{\"result\":0,\"node_type\":\"secondary\",\"address\":\"192.168.130.79\",\"service_status\":\"up\",\"status\":\"failed\",\"galera_size\":\"\",\"galera_myisam\":\"\",\"error\":\"\"}"}]}
                        if (resp.result != 0) return resp;
                        responses.push(resp.responses[0]);
                        this.log("in cmdByGroup cmdById nodes->" + responses);
                    }
                }
                return { result: 0, responses: responses }
            }
        }

        return api.env.control.ExecCmdByGroup(envName, session, nodeGroup, toJSON([{ command: command }]), true, false, ROOT);
    };

    this.cmdById = function(id, command, timeout) {
        if (timeout) {
            command = "timeout " + timeout + "s bash -c \"" + command + "\"";
        }

        return api.env.control.ExecCmdById(envName, session, id, toJSON([{ command: command }]), true, ROOT);
    };
}

return new promoteNewPrimary().run();

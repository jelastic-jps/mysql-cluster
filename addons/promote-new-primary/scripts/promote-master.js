//@reg(envName, token, uid)
function promoteNewPrimary() {
    let envInfo;
    let ROOT = "root";
    let PROXY = "proxy";
    let SQLDB = "sqldb";
    let PRIMARY = "Primary";
    let SECONDARY = "secondary";
    let FAILED = "failed";
    let Response = com.hivext.api.Response;
    let TMP_FILE = "/var/lib/jelastic/promotePrimary";
    let session = getParam("session", "");

    this.run = function() {
        let resp = this.auth();
        this.log("auth resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.newPrimaryOnProxy();
        this.log("newPrimaryOnProxy resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.promoteNewSQLPrimary();
        this.log("promoteNewSQLPrimary resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.restoreNodes();
        this.log("restoreNodes resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.setContainerVar();
        this.log("setContainerVar resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.addNode();
        this.log("addNode func resp ->" + resp);
        if (resp.result != 0) return resp;

        return this.removeFailedPrimary();
    };

    this.log = function(message) {
        api.marketplace.console.WriteLog(appid, session, message);
    };

    this.auth = function() {
        if (!session && String(getParam("token", "")).replace(/\s/g, "") != "${token}") {
            return {
                result: Response.PERMISSION_DENIED,
                error: "wrong token",
                type:"error",
                message:"Token [" + token + "] does not match",
                response: { result: Response.PERMISSION_DENIED }
            };
        }

        return this.cmdByGroup("touch " + TMP_FILE, PROXY);
    };

    this.setContainerVar = function() {
        return api.environment.control.AddContainerEnvVars({
            envName: envName,
            session: session,
            nodeGroup: SQLDB,
            vars: {
                PRIMARY_IP: this.getNewPrimaryNode().address
            }
        });
    };

    this.diagnosticNodes = function() {
        let command = "curl -fsSL 'https://github.com/jelastic-jps/mysql-cluster/raw/JE-66025/addons/recovery/scripts/db-recovery.sh' -o /tmp/db_recovery.sh\n" +
            "bash /tmp/db_recovery.sh --diagnostic"
        let resp = this.cmdByGroup(command, SQLDB);
        this.log("diagnosticNodes resp ->" + resp);
        if (resp.result != 0) return resp;

        let responses = resp.responses, out;
        let nodes = [];

        if (responses.length) {
            for (let i = 0, n = responses.length; i < n; i++) {
                out = JSON.parse(responses[i].out);
                nodes.push({
                    address: out.address,
                    id: responses[i].nodeid,
                    type: out.node_type
                });
            }

            if (nodes.length) {
                this.setParsedNodes(nodes);
            }
        }

        return { result: 0, nodes: nodes};
    };

    this.getEnvInfo = function() {
        if (!envInfo) {
            envInfo = api.env.control.GetEnvInfo(envName, session);
        }

        return envInfo;
    };

    this.getNewPrimaryNode = function() {
        return this.newPrimaryNode;
    };

    this.setNewPrimaryNode = function(node) {
        this.newPrimaryNode = node;
    };

    this.getFailedPrimary = function() {
        return this.failedPrimary;
    };

    this.setFailedPrimary = function(node) {
        this.failedPrimary = node;
    };

    this.getParsedNodes = function() {
        return this.parsedNodes;
    };

    this.setParsedNodes = function(nodes) {
        this.parsedNodes = nodes;
    };

    this.getNodesByGroup = function(group) {
        let groupNodes = [];

        let resp = this.getEnvInfo();
        if (resp.result != 0) return resp;

        let nodes = resp.nodes;

        for (let i = 0, n = nodes.length; i < n; i++) {
            if (nodes[i].nodeGroup == group) {
                groupNodes.push(nodes[i]);
            }
        }

        return { result: 0, nodes: groupNodes }
    };

    this.getSQLNodeById = function(nodeid) {
        let node;
        let resp = this.getNodesByGroup(SQLDB);
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
        if (resp.result != 0) return resp;

        let nodes = this.getParsedNodes();
        this.log("newPrimaryOnProxy getParsedNodes nodes ->" + nodes);

        if (nodes) {
            for (let i = 0, n = nodes.length; i < n; i++) {
                if (nodes[i]) {
                    this.log("newPrimaryOnProxy nodes[i] ->" + nodes[i]);
                    this.log("newPrimaryOnProxy alreadySetNewPrimary ->" + alreadySetNewPrimary);
                    if (nodes[i].type == SECONDARY && !alreadySetNewPrimary) {
                        this.setNewPrimaryNode(nodes[i]);
                        alreadySetNewPrimary = true;
                    } else {
                        resp = api.env.control.SetNodeDisplayName(envName, session, nodes[i].id, PRIMARY + " - " + FAILED);
                        if (resp.result != 0) return resp;

                        resp = this.getSQLNodeById(nodes[i].id);
                        if (resp.result != 0) return resp;

                        this.setFailedPrimary(resp.node);
                    }
                }
            }

            let command = "bash /usr/local/sbin/jcm.sh newPrimary --server=node" + this.getNewPrimaryNode().id;
            this.log("newPrimaryOnProxy command ->" + command);
            return this.cmdByGroup(command, PROXY);
        }

        return { result: 0 }
    };

    this.promoteNewSQLPrimary = function() {
        let newPrimary = this.getNewPrimaryNode();

        this.log("promoteNewSQLPrimary newPrimary ->" + newPrimary);
        let command = "curl -fsSL 'https://github.com/jelastic-jps/mysql-cluster/raw/JE-66025/addons/recovery/scripts/db-recovery.sh' -o /tmp/db_recovery.sh\n" +
            "bash /tmp/db_recovery.sh --scenario promote_new_primary";
        let resp = this.cmdById(newPrimary.id, command);
        this.log("promoteNewSQLPrimary cmdById ->" + resp);
        if (resp.result != 0) return resp;

        return api.env.control.SetNodeDisplayName(envName, session, newPrimary.id, PRIMARY);
    };

    this.restoreNodes = function() {
        this.log("restoreNodes in ->");
        let nodes = this.getParsedNodes();

        let newPrimary = this.getNewPrimaryNode();
        this.log("restoreNodes newPrimary ->" + newPrimary);

        let command = "/bash /tmp/db_recovery.sh --scenario restore_secondary_from_primary --donor-ip " + newPrimary.address;
        for (let i = 0, n = nodes.length; i < n; i++) {
            if (nodes[i].id != newPrimary.id && nodes[i].type == SECONDARY) {
                let resp = this.cmdById(nodes[i].id, command);
                this.log("restoreNodes cmdById ->" + resp);
                if (resp.result != 0) return resp;
            }
        }

        return { result: 0 }
    };

    this.addNode = function() {
        let envInfo = this.getEnvInfo();
        if (envInfo.result != 0) return envInfo;

        let resp = this.getNodesByGroup(SQLDB);
        if (resp.result != 0) return resp;
        let sqlNodes = resp.nodes;

        resp = this.getNodesByGroup(PROXY);
        if (resp.result != 0) return resp;

        let proxyNodes = resp.nodes;
        this.log("nodes->" + [{
            nodeType: sqlNodes[0].nodeType,
            nodeGroup: sqlNodes[0].nodeGroup,
            count: sqlNodes.length + 1,
            fixedCloudlets: sqlNodes[0].fixedCloudlets,
            flexibleCloudlets: sqlNodes[0].flexibleCloudlets
        },{
            nodeType: proxyNodes[0].nodeType,
            nodeGroup: proxyNodes[0].nodeGroup,
            count: proxyNodes.length,
            fixedCloudlets: proxyNodes[0].fixedCloudlets,
            flexibleCloudlets: proxyNodes[0].flexibleCloudlets
        }]);

        resp = api.env.control.ChangeTopology({
            envName: envName,
            session: session,
            env: {
                region: envInfo.env.hostGroup.uniqueName,
                sslstate: envInfo.env.sslstate
            },
            nodes: [{
                nodeType: sqlNodes[0].nodeType,
                nodeGroup: sqlNodes[0].nodeGroup,
                count: sqlNodes.length + 1,
                fixedCloudlets: sqlNodes[0].fixedCloudlets,
                flexibleCloudlets: sqlNodes[0].flexibleCloudlets
            },{
                nodeType: proxyNodes[0].nodeType,
                nodeGroup: proxyNodes[0].nodeGroup,
                count: proxyNodes.length,
                fixedCloudlets: proxyNodes[0].fixedCloudlets,
                flexibleCloudlets: proxyNodes[0].flexibleCloudlets
            }]
        });
        if (resp.result != 0) return resp;

        return this.cmdByGroup("rm -rf " + TMP_FILE, PROXY);
    };

    this.removeFailedPrimary = function() {
        let failedPrimary = this.getFailedPrimary();
        this.log("in removeFailedPrimary and !failedPrimary.ismaster");
        if (failedPrimary && !failedPrimary.ismaster) {
            this.log("removeFailedPrimary failedPrimary->" + failedPrimary);
            return api.env.control.RemoveNode(envName, session, failedPrimary.id);
        }

        return { result: 0 }
    };

    this.cmdByGroup = function(command, nodeGroup) {
        return api.env.control.ExecCmdByGroup(envName, session, nodeGroup, toJSON([{ command: command }]), true, false, ROOT);
    };

    this.cmdById = function(id, command) {
        return api.env.control.ExecCmdById(envName, session, id, toJSON([{ command: command }]), true, ROOT);
    };
};

return new promoteNewPrimary().run();

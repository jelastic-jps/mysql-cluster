//@reg(envName, token)
function promoteNewPrimary() {
    let envInfo;
    let ROOT = "root";
    let PROXY = "proxy";
    let SQLDB = "sqldb";
    let PRIMARY = "Primary";
    let SECONDARY = "secondary";
    let Response = com.hivext.api.Response;

    this.run = function() {

        let resp = this.auth();
        if (resp.result != 0) return resp;

        resp = this.newPrimaryOnProxy();
        log("newPrimaryOnProxy resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.promoteNewSQLPrimary();
        log("promoteNewSQLPrimary resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.restoreNodes();
        log("restoreNodes resp ->" + resp);
        if (resp.result != 0) return resp;

        resp = this.setContainerVar();
        if (resp.result != 0) return resp;

        return this.addNode();
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
        } else {
            session = signature;
        }
    };

    this.setContainerVar = function() {
        return api.environment.control.AddContainerEnvVars({
            envName: "${env.name}",
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
        log("diagnosticNodes resp ->" + resp);
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
        let resp = this.diagnosticNodes();
        if (resp.result != 0) return resp;

        let nodes = this.getParsedNodes();
        log("newPrimaryOnProxy getParsedNodes nodes ->" + nodes);

        if (nodes) {
            for (let i = 0, n = nodes.length; i < n; i++) {
                if (nodes[i] && nodes[i].type == SECONDARY) {
                    this.setNewPrimaryNode(nodes[i]);
                    break;
                }
            }

            let command = "curl -fsSL 'https://github.com/jelastic-jps/mysql-cluster/raw/JE-66025/addons/promote-new-primary/scripts/jcm.sh' -o /usr/local/bin/jcm\n" +
                "bash /usr/local/bin/jcm newPrimary --node-id=" + this.getNewPrimaryNode().id;
            log("newPrimaryOnProxy command ->" + command);
            return this.cmdByGroup(command, PROXY);
        }

        return { result: 0 }
    };

    this.promoteNewSQLPrimary = function() {
        let newPrimary = this.getNewPrimaryNode();

        log("promoteNewSQLPrimary newPrimary ->" + newPrimary);
        let command = "curl -fsSL 'https://github.com/jelastic-jps/mysql-cluster/raw/JE-66025/addons/recovery/scripts/db-recovery.sh' -o /tmp/db_recovery.sh\n" +
            "bash /tmp/db_recovery.sh --scenario promote_new_primary";
        let resp = this.cmdById(newPrimary.id, command);
        log("promoteNewSQLPrimary cmdById ->" + resp);
        if (resp.result != 0) return resp;

        // let REGEXP = new RegExp('\\b - Slave\\b', 'gi');

        return api.env.control.SetNodeDisplayName(envName, session, newPrimary.id, PRIMARY);

        //https://github.com/jelastic-jps/mysql-cluster/raw/JE-66025/addons/recovery/scripts/db-recovery.sh
        //bash /tmp/db_recovery.sh --scenario promote_new_primary (setNodeDisaplay from secondary to primary)
    };

    this.restoreNodes = function() {
        let nodes = this.getParsedNodes();
        if (nodes.result != 0) return nodes;

        let newPrimary = this.getNewPrimaryNode();
        log("restoreNodes newPrimary ->" + newPrimary);

        let command = "/bash /tmp/db_recovery.sh --scenario restore_secondary_from_primary --donor-ip " + newPrimary.address;
        for (let i = 0, n = nodes.length; i < n; i++) {
            if (nodes[i].id != newPrimary.id && nodes[i].type == SECONDARY) {
                let resp = this.cmdById(nodes[i].id, command);
                log("restoreNodes cmdById ->" + resp);
                if (resp.result != 0) return resp;
            }
        }

        return { result: 0 }
    };

    this.addNode = function() {
        let resp = this.getSQLNodeById(this.getNewPrimaryNode().id);
        if (resp.result != 0) return resp;

        let node = resp.node;

        return api.environment.control.AddNode({
            envName: "${env.name}",
            session: session,
            displayName: SECONDARY,
            cloudlets: node.cloudlets,
            //flexibleCloudlets: node.flexibleCloudlets,
            nodeType: node.nodeType,
            nodeGroup: node.nodeGroup
        });
        //nodeGroupData=[string]&extIp=[boolean]&password=[string]&startService=[boolean]&engine=[string]&envName=[string]&options=[string]&fixedCloudlets=[int]&tag=[string]
    }

    this.cmdByGroup = function(command, nodeGroup) {
        return api.env.control.ExecCmdByGroup(envName, session, nodeGroup, toJSON([{ command: command }]), true, false, ROOT);
    };

    this.cmdById = function(id, command) {
        return api.env.control.ExecCmdById(envName, session, id, toJSON([{ command: command }]), true, ROOT);
    };
};

function log(message) {
    api.marketplace.console.WriteLog(message);
}

return new promoteNewPrimary().run();

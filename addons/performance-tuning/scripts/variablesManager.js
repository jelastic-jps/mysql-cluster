function ApplySQLVariable() {
    let envName = "${env.envName}";
    let varName = "varName";
    let varValue = "varValue";

    let threadsNumber = "threadsNumber";
    let MYSQL_THREADS = "mysql-threads";

    let MAX_CONNECTIONS = "mysql-max_connections";
    let maxConnections = "maxConnections";
    let dbMaxConnections = "dbMaxConnections";

    let ROOT = "root";
    let MY_CNF = "/etc/my.cnf";
    let envInfo;
    let SQLDB = "sqldb";
    let PRIMARY = "Primary";
    let SECONDARY = "Secondary";

    this.run = function() {
        let resp = this.defineMyCNF();
        if (resp.result != 0) return resp;

        resp = this.defineWeights();
        if (resp.result != 0) return resp;

        return this.getVariables();
    };

    this.getVariables = function() {
        let command = "curl -fsSL 'https://raw.githubusercontent.com/sych74/mysql-cluster/JE-66111/addons/performance-tuning/scripts/scripts/jcm.sh' -o /tmp/jcm.sh\n" +
            "bash /tmp/jcm.sh getGlobalVariables"
        let resp = this.cmdById("${nodes.proxy.master.id}", command);
        if (resp.result != 0) return resp;

        let variables = JSON.parse(resp.responses[0].out);

        resp = this.formatVariables(variables);
        if (resp.result != 0) return resp;

        settings = settings || {};
        settings.fields = settings.fields || {};

        let field;
        for (let i = 0, n = settings.fields.length; i < n; i++) {
            field = settings.fields[i];
            if (field.name == varName) {
                field.values = resp.variables;
            }

            if (field.name == varValue) {
                field.dependsOn = resp.dependsData;
            }

            if (field.caption == "ProxySQL Threads" && this.getMySQLThreads()) {
                if (field.items && field.items[0]) {
                    field.items[0].value = this.getMySQLThreads();
                }
            }

            if (field.name == maxConnections && this.getMaxConnections()) {
                field.value = this.getMaxConnections();
            }

            if (field.name == dbMaxConnections && this.getDbMaxConnections()) {
                field.value = this.getDbMaxConnections();
            }

            if (field.caption == "Weights Ratio" && this.getWeights()) {
                if (field.items) {
                    let item;
                    for (let k = 0, l = field.items.length; k < l; k++) {
                        item = field.items[k];
                        if (item) {
                            if (item.name == "weightMaster") {
                                item.value = parseInt(this.getWeights().primary);
                            } else if (item.name == "weightSlave") {
                                item.value = parseInt(this.getWeights().secondary);
                            }
                        }
                    }
                }
            }
        }

        return settings;
    };

    this.defineWeights = function() {
        let resp = this.getNodesByGroup(SQLDB);
        if (resp.result != 0) return resp;

        let primaryWeight = "";
        let secondaryWeight = "";

        let nodes = resp.nodes;

        for (let i = 0, n = nodes.length; i < n; i++) {
            if (nodes[i].displayName == SECONDARY) {
                resp = this.getWeight(nodes[i].id);
                if (resp.result != 0) return resp;

                secondaryWeight = resp.weight;
            }

            if (nodes[i].displayName == PRIMARY) {
                resp = this.getWeight(nodes[i].id);
                if (resp.result != 0) return resp;

                primaryWeight = resp.weight;
            }
        }

        this.setWeights({
            primary: primaryWeight,
            secondary: secondaryWeight
        });

        return { result: 0 }
    };

    this.getWeight = function(id) {
        let command = "mysql -uadmin -padmin -h 127.0.0.1 -P6032 -e \"select weight from mysql_servers where hostname = 'node" + id + "';\"  | sed '2,4!d'  | tail -n 1";
        let resp = this.cmdById("${nodes.proxy.master.id}", command);
        if (resp.result != 0) return resp;
        return {
            result: 0,
            weight: resp.responses[0].out
        }
    };

    this.getEnvInfo = function() {
        if (!envInfo) {
            envInfo = api.env.control.GetEnvInfo("${env.name}", session);
            if (envInfo.result != 0) return envInfo;

        }

        return envInfo;
    };

    this.getNodesByGroup = function(group) {
        envInfo = this.getEnvInfo();
        if (envInfo.result != 0) return envInfo;

        let nodes = [];

        for (let i = 0, n = envInfo.nodes.length; i < n; i++) {
            if (envInfo.nodes[i].nodeGroup == group) {
                nodes.push(envInfo.nodes[i]);
            }
        }

        return {
            result: 0,
            nodes: nodes
        }
    };

    this.defineMyCNF = function() {
        let command = "grep -q 'max_connections' " + MY_CNF + " && { grep -r 'max_connections' " + MY_CNF + " | cut -c 17- || echo \"\"; } || { sed -i \"s|\\[mysqld\\]|\\[mysqld\\]\\nmax_connections=2048|g\" " + MY_CNF + "; echo 2048; };";
        let resp = this.cmdById("${nodes.proxy.master.id}", command);
        if (resp.result != 0) return resp;

        let max_connections = resp.responses[0].out;
        this.setDbMaxConnections(parseInt(max_connections));

        return {
            result: 0
        };
    };

    this.formatVariables = function(variables) {
        let dependsData = {};
        let dependsValues = {};
        let formatedData = [];
        let variable;

        for (let i = 0 , n = variables.length; i < n; i++) {
            variable = variables[i];
            formatedData.push({
                caption: variable.variable_name,
                value: variable.variable_name
            });

            dependsData[variable.variable_name] = [{
                caption: variable.variable_value,
                value: variable.variable_value
            }];

            if (variable.variable_name == MYSQL_THREADS) {
                this.setMySQLThreads(variable.variable_value);
            }

            if (variable.variable_name == MAX_CONNECTIONS) {
                this.setMaxConnections(variable.variable_value);
            }
        }

        if (dependsData) {
            dependsValues[varName] = dependsData;
        }

        return {
            result: 0,
            variables: formatedData,
            dependsData: dependsValues
        }
    };

    this.getDbMaxConnections = function() {
        return this.dbMaxConnections;
    };

    this.setDbMaxConnections = function(connections) {
        this.dbMaxConnections = connections;
    };

    this.getWeights = function() {
        return this.weights;
    };

    this.setWeights = function(weights) {
        this.weights = weights;
    };

    this.getMySQLThreads = function() {
        return this.mysqlThreads;
    };

    this.setMySQLThreads = function(threads) {
        this.mysqlThreads = threads;
    };

    this.getMaxConnections = function() {
        return this.maxConnections;
    };

    this.setMaxConnections = function(connections) {
        this.maxConnections = connections;
    };

    this.cmdById = function(id, command) {
        return api.env.control.ExecCmdById(envName, session, id, toJSON([{ command: command }]), true, ROOT);
    };
};

function log(message) {
    api.marketplace.console.WriteLog(message);
}

return new ApplySQLVariable().run();

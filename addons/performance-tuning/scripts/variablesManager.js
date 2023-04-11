import com.hivext.api.core.utils.Transport;

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

    this.run = function() {
        let resp = this.defineMyCNF();
        if (resp.result != 0) return resp;



        return this.getVariables();
    };

    this.getVariables = function() {
        let command = "curl -fsSL 'https://github.com/jelastic-jps/mysql-cluster/raw/JE-66025/addons/promote-new-primary/scripts/jcm.sh' -o jcm.sh\n" +
            "bash jcm.sh getGlobalVariables"
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

            if (field.name == threadsNumber && this.getMySQLThreads()) {
                field.value = this.getMySQLThreads();
            }

            if (field.name == maxConnections && this.getMaxConnections()) {
                field.value = this.getMaxConnections();
            }

            if (field.name == dbMaxConnections && this.getDbMaxConnections()) {
                field.value = this.getDbMaxConnections();
            }

        }

        return settings;
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

            dependsData[variable.variable_name] = {
                value: variable.variable_value
            };

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

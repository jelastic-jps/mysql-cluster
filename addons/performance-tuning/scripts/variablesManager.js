import com.hivext.api.core.utils.Transport;

function ApplySQLVariable() {
    let envName = "${env.envName}";
    let varName = "varName";
    let varValue = "varValue";

    let ROOT = "root";

    this.run = function() {
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
        }

        return settings;
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

    this.cmdById = function(id, command) {
        return api.env.control.ExecCmdById(envName, session, id, toJSON([{ command: command }]), true, ROOT);
    };
};

function log(message) {
    api.marketplace.console.WriteLog(message);
}

return new ApplySQLVariable().run();

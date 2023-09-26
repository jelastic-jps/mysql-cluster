function ApplySQLVariable() {
  let envName = "${env.envName}";
  let varName = "varName";
  let varValue = "varValue";

  let minWeight = 0; 
  let maxWeight = 10000000;

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

    return this.getVariables();
  };

  this.getScheme =  function() {
    let nodeGroups, resp, scheme = "";

    resp = api.env.control.GetNodeGroups("${env.name}", session);
    if (resp.result != 0) return resp;

    nodeGroups = resp.object;
    for (var i = 0, n = nodeGroups.length; i < n; i++) {
      if (nodeGroups[i].name == 'sqldb' && nodeGroups[i].cluster && nodeGroups[i].cluster.enabled && nodeGroups[i].cluster.settings.scheme) {
        scheme = String(nodeGroups[i].cluster.settings.scheme);
      }
    }
    return scheme;
  };
    
  this.weightToPercent =  function(weight) {
    let percent;
    parsedWeight = parseInt(weight);
    if (parsedWeight == minWeight) percent = 0;
    if (parsedWeight >= 1 && parsedWeight <= 100000) percent = 1;
    if (parsedWeight > 100000) percent = (parsedWeight / maxWeight) * 100;
    return {
      result: 0,
      percent: percent
    }
  };

  this.getVariables = function() {
    let command = "curl -fsSL 'https://raw.githubusercontent.com/sych74/mysql-cluster/JE-66111/addons/performance-tuning/scripts/jcm.sh' -o /tmp/jcm.sh\n" +
    "bash /tmp/jcm.sh getGlobalVariables"
    let resp = this.cmdById("${nodes.proxy.master.id}", command);
    if (resp.result != 0) return resp;

    let variables = JSON.parse(resp.responses[0].out);

    resp = this.formatVariables(variables);
    if (resp.result != 0) return resp;

    settings = settings || {};
    fields = settings.fields || {};

    let field;
    for (let i = 0, n = fields.length; i < n; i++) {
      field = fields[i];
    
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
    }

    resp = this.getNodesByGroup(SQLDB);
    if (resp.result != 0) return resp;

    let nodes = resp.nodes.sort(function (a, b) { return a.id - b.id; });
    let scheme = this.getScheme();
  
    if (scheme == "galera"){
      fields.push({
        "type": "compositefield",
        "caption": "Write nodes count",
        "items": [{
          "type": "spinner",
          "name": "maxWriters",
          "value": this.getGaleraMaxWriters().maxWriters,
          "min": 1,
          "max": nodes.length
        }]
      }, {
        "type": "displayfield"
      });
    }
  
    fields.push({
      "type": "compositefield",
      "defaultMargins": "0 12 0 0",
      "items": [{
        "type": "displayfield",
        "markup": "Weights Ratio %",
        "name": "prmnode"
      }, {
        "type": "displayfield",
        "markup": "",
        "cls": "x-form-item-label",
        "width": "70",
        "tooltip":[{
          "text": "The bigger the weight of a server relative to other weights, the higher the probability of the server to be chosen from a hostgroup. ProxySQL default load-balancing algorithm is random-weighted."
        }, {
          "minWidth": "370"
        }]
      }]
    });

    for (let i = 0, n = nodes.length; i < n; i++) {
      fields.push({
        "type": "compositefield",
        "caption": nodes[i].displayName+" node"+nodes[i].id,
        "items": [{
          "type": "spinner",
          "name": nodes[i].id,
          "value": weightToPercent((nodes[i].id).weight).percent,
          "min": "0",
          "max": "100"
        }]
      });
    }
    return settings;
  };

  this.getWeight = function(id) {
    let command = "bash /tmp/jcm.sh getWeight --node=node"+id;
    let resp = this.cmdById("${nodes.proxy.master.id}", command);
    if (resp.result != 0) return resp;
    return {
      result: 0,
      weight: resp.responses[0].out
    }
  };

  this.getGaleraMaxWriters = function() {
    let command = "bash /tmp/jcm.sh getGaleraMaxWriters";
    let resp = this.cmdById("${nodes.proxy.master.id}", command);
    if (resp.result != 0) return resp;
    return {
      result: 0,
      maxWriters: resp.responses[0].out
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

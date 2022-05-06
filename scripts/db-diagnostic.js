      var SH_SCRIPT = "bash /home/jelastic/diagnostic.sh",
        SQLDB = "sqldb",
        SUCCESS = "success",
        WARNING = "warning",
        ERRORS_FOUND_CODE = 1001,
        AUTH_ERROR_CODE = 2,
        ROOT = "root",
        parsed,
        resp,
        fields = [],
        nodes,
        id;

      resp = jelastic.env.control.GetEnvInfo('${env.envName}', session);
      if (resp.result != 0) return resp;
      nodes = resp.nodes;

      for (var i = 0, n = nodes.length; i < n; i++) {
        if (nodes[i].nodeGroup == SQLDB) {
          resp = api.env.control.ExecCmdById("${env.name}", session, nodes[i].id, toJSON([{ command: "curl -fsSL \"https://raw.githubusercontent.com/lazarenkoalexey/mysql-cluster/v2.5.0-test/scripts/db-diagnostic.sh\" -o /home/jelastic/diagnostic.sh && bash diagnostic.sh ${this.login} ${this.password}" }]), true, ROOT);
          if (resp.result == 4109) {
            if (resp.responses[0].exitStatus == 2) { //auth error
              return {
                type: WARNING,
                message: resp.responses[0].out
              };
            }
            
            if (resp.responses[0].exitStatus == 1) { //when errors were found
              return {
                result: ERRORS_FOUND_CODE,
                type: SUCCESS
              };
            }
          }
          if (resp.result != 0) return resp;

          parsed = JSON.parse(resp.responses[0].out);
         
         api.marketplace.console.WriteLog("parsed-> " + parsed);

         fields.push({
               type: "displayfield",
               name: "nodeid",
               caption: "Node ID - " + nodes[i].id,
               markup: ""
         },{
                type: "text",
                name: "details",
                caption: "Details:",
                value: "SERVICE STATUS - " + parsed.SERVICE_STATUS + "\nGALERA CLUSTER SIZE - " + parsed.GALERA_CLUSTER_SIZE + "\nGALERA CLUSTER STATUS - " + parsed.GALERA_CLUSTER_STATUS + "\nSEQUENCE NUMBER - " + parsed.SEQUENCE_NUMBER,
                height: '130px',
                width: '430px'
          });
        }
      }

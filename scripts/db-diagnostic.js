      var SH_SCRIPT = "bash /home/jelastic/diagnostic.sh",
        SQLDB = "sqldb",
        SUCCESS = "success",
        WARNING = "warning",
        NO_ERRORS_FOUND_CODE = 1000,
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
          resp = api.env.control.ExecCmdById("${env.name}", session, nodes[i].id, toJSON([{ command: "curl -fsSL \"https://github.com/lazarenkoalexey/mysql-cluster/raw/v2.5.0-test/scripts/db-diagnostic.sh\" -o /home/jelastic/diagnostic.sh && bash /home/jelastic/diagnostic.sh ${this.login:} ${this.password:}" }]), true, ROOT);
          api.marketplace.console.WriteLog("resp->" + resp);
          if (resp.result == 4109) {
              if (resp.responses[0].exitStatus == 2) {
                  return {
                    type: WARNING,  //aUTH ERROR
                    message: resp.responses[0].out
                  };
              }
              
              if (resp.responses[0].exitStatus == 1) {
                  return {
                      result: ERRORS_FOUND_CODE, //when errors were found
                      type: SUCCESS
                      
                  };
              }
          }
        }
      }

      return {
          result: NO_ERRORS_FOUND_CODE,
          type: SUCCESS
      };

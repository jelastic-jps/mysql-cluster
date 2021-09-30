        var message = "", status = [];
        var resp = jelastic.env.control.GetEnvInfo('${env.envName}', session);
        if (resp.result != 0) return resp;
        var nodeID, count, maxCount = 0;
        for (var i = 0, n = resp.nodes; i < n.length; i++) {
          if (n[i].nodeGroup == nodeGroup) {
            var cmd = jelastic.env.control.ExecCmdById(getParam('TARGET_APPID'), session, n[i].id, toJSON([{ "command": "mysqladmin -u'${settings.db_user}' -p'${settings.db_pass}' ping"}]), false, "root");
            if (cmd.responses[0].errOut.indexOf('Access denied') > -1) {
              return {
                result: 'success',
                message: "node" + n[i].id + "  \n Authentication check failed. Please specify correct credentials."
              }
            }
          }
        }
        message += "**Mysql service status**  \n";
        for (var i = 0, n = resp.nodes; i < n.length; i++) {
          if (n[i].nodeGroup == nodeGroup) {
            var cmd = jelastic.env.control.ExecCmdById(getParam('TARGET_APPID'), session, n[i].id, toJSON([{ "command": "mysqladmin -u'${settings.db_user}' -p'${settings.db_pass}' ping"}]), false, "root");
            if (cmd.responses[0].out.indexOf('is alive') > -1) {
              message += "node" + n[i].id + " - service is running  \n";
              status.push(true);
            } else {
              message += "node" + n[i].id + " - service is not running  \n";
              status.push(false);
            }
          }
        }      
        message += "  \n**Galera cluster size**  \n";
        for (var i = 0, n = resp.nodes; i < n.length; i++) {
          if (n[i].nodeGroup == nodeGroup && status[i]) {
            var cmd = jelastic.env.control.ExecCmdById(getParam('TARGET_APPID'), session, n[i].id, toJSON([{ "command": "mysql -u'${settings.db_user}' -p'${settings.db_pass}' -Nse \"show global status like 'wsrep_cluster_size';\" | awk '{print $NF}'"}]), false, "root");
            if (cmd.responses[0].out == status.length) {
              message += "node" + n[i].id + " - cluster size is valid " + cmd.responses[0].out +"  \n";
            } else {
              message += "node" + n[i].id + " - cluster size is not valid " + cmd.responses[0].out + " instead " + status.length + "  \n";
            }
          }
        }
        
        message += "  \n**Galera cluster status**  \n";
        for (var i = 0, n = resp.nodes; i < n.length; i++) {
          if (n[i].nodeGroup == nodeGroup && status[i]) {
            var cmd = jelastic.env.control.ExecCmdById(getParam('TARGET_APPID'), session, n[i].id, toJSON([{ "command": "mysql -u'${settings.db_user}' -p'${settings.db_pass}' -Nse \"show global status like 'wsrep_cluster_status';\" | awk '{print $NF}'"}]), false, "root");
            message += "node" + n[i].id + " - cluster status " + cmd.responses[0].out +"  \n";
          }
        }

        message += "  \n**Galera cluster state**  \n";
        for (var i = 0, n = resp.nodes; i < n.length; i++) {
          if (n[i].nodeGroup == nodeGroup && status[i]) {
            var cmd = jelastic.env.control.ExecCmdById(getParam('TARGET_APPID'), session, n[i].id, toJSON([{ "command": "mysql -u'${settings.db_user}' -p'${settings.db_pass}' -Nse \"show global status like 'wsrep_local_state_comment';\" | awk '{print $NF}'"}]), false, "root");
            message += "node" + n[i].id + " - cluster state " + cmd.responses[0].out +"  \n";
          }
        }
        return { result: 'success', message: message, status: cmd.responses}
      nodeGroup: sqldb      

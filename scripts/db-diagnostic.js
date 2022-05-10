var SH_SCRIPT = "bash /home/jelastic/diagnostic.sh",
    SQLDB = "sqldb",
    SUCCESS = "success",
    WARNING = "warning",
    NO_ERRORS_FOUND_CODE = 1000,
    ERRORS_FOUND_CODE = 1001,
    AUTH_ERROR_CODE = 2,
    ROOT = "root",
    resp,
    nodes,
    id;

resp = api.env.control.ExecCmdById("${env.name}", session, ${nodes.sqldb.master.id}, toJSON([{ command: "curl -fsSL \"https://raw.githubusercontent.com/lazarenkoalexey/mysql-cluster/v2.5.0-test/scripts/db-diagnostic.sh\" -o /home/jelastic/diagnostic.sh && bash /home/jelastic/diagnostic.sh ${nodes.sqldb.length} ${this.login:} ${this.password:}" }]), true, ROOT);

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

return {
    result: NO_ERRORS_FOUND_CODE,
    type: SUCCESS
};

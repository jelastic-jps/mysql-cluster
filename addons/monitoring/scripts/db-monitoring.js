//@reg(envName, token, uid)

var ROOT = "root";
var envName = getParam("envName", "${env.envName}");
var Response = com.hivext.api.Response;
var SQLDB = "sqldb";

function run() {
    var tokenParam = String(getParam("token", "")).replace(/\s/g, "");
    if (!session && tokenParam != "${token}") {
        return {
            result: Response.PERMISSION_DENIED,
            error: "wrong token",
            type: "error",
            message: "Token [" + tokenParam + "] does not match",
            response: { result: Response.PERMISSION_DENIED }
        };
    }
    var info = jelastic.env.control.GetEnvInfo(envName, session);
    if (info.result != 0) return info;

    var resp;
    var userEmail = getParam("userEmail", "");
    var userSession = getParam("session", session);
    api.marketplace.console.WriteLog(appid, session, "DB Monitoring: sendEmail started for env " + envName);
    var command = "/usr/local/sbin/db-monitoring.sh sendEmail '" + userSession + "' '" + userEmail + "'";

    // execute on all SQL DB nodes, analogous to promote-master.js style
    resp = api.env.control.ExecCmdByGroup(envName, session, SQLDB, toJSON([{ command: command }]), true, false, ROOT);
    if (resp.result != 0) return resp;

    api.marketplace.console.WriteLog(appid, session, "DB Monitoring: sendEmail completed");
    return { result: 0 };
}

try {
    return run();
} catch (ex) {
    return { result: com.hivext.api.Response.ERROR_UNKNOWN, error: "Error: " + toJSON(ex) };
}



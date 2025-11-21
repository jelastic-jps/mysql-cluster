//@reg(envName, token, uid)

var ROOT = "root";
var envName = getParam("envName", "${env.envName}");
var Response = com.hivext.api.Response;

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

    var nodes = info.nodes || [], node, resp;
    var userEmail = user.email;
    var userSession = session;
    // pass USER_SESSION and USER_EMAIL as positional arguments
    var command = "/usr/local/sbin/db-monitoring.sh sendEmail '" + userSession + "' '" + userEmail + "'";

    for (var i = 0, n = nodes.length; i < n; i++) {
        node = nodes[i];
        if (node.nodeGroup == "sqldb") {
            resp = jelastic.env.control.ExecCmdById(envName, session, node.id, toJSON([{ command: command }]), true, ROOT);
            if (resp.result != 0) return resp;
        }
    }

    return { result: 0 };
}

try {
    return run();
} catch (ex) {
    return { result: com.hivext.api.Response.ERROR_UNKNOWN, error: "Error: " + toJSON(ex) };
}



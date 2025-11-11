//@auth

var ROOT = "root";
var envName = getParam("envName", "${env.envName}");

function run() {
    var info = jelastic.env.control.GetEnvInfo(envName, session);
    if (info.result != 0) return info;

    var nodes = info.nodes || [], node, resp;
    var userEmail = user.email;
    var userSession = session;
    // pass USER_SESSION and USER_EMAIL as positional arguments
    var command = "/usr/local/sbin/db-monitoring.sh '" + userSession + "' '" + userEmail + "'";

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



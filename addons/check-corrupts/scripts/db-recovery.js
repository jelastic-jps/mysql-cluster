var AUTH_ERROR_CODE = 701,
    CORRUPT_ERROR_CODE = 97,
    CODE_OK = 200,
    TARGET_NODE = "${targetNodes.nodeGroup}",
    envName = "${env.name}",
    exec = getParam('exec', ''),
    checkCorrupt = getParam('checkCorrupt', false),
    sqlNodes = [],
    CORRUPTED_UPPER_CASE = "CORRUPTED",
    SUCCESS = "success",
    WARNING = "warning",
    ROOT = "root",
    envInfo,
    nodes = [],
    item,
    resp;

if (checkCorrupt) {
    resp = getTargetNodes();
    if (resp.result != 0) return resp;

    nodes = resp.nodes;

    for (i = 0, n = nodes.length; i < n; i ++) {
        resp = execRecovery(nodes[i].id);
        if (resp.result != 0) return resp;

        resp = parseOut(resp.responses, nodes[i]);
        if (resp.result != 0) return resp;
    }
}

function parseOut(data, node) {
    var resp,
        nodeid;

    if (data.length) {
        for (var i = 0, n = data.length; i < n; i++) {
            nodeid = data[i].nodeid;
            if (data[i] && data[i].out) {
                item = data[i].out;

                api.marketplace.console.WriteLog("item->" + item);
                item = JSON.parse(item);

                if (item.result == AUTH_ERROR_CODE) {
                    return {
                        type: WARNING,
                        message: item.error,
                        result: AUTH_ERROR_CODE
                    };
                }

                if (item.result == CORRUPT_ERROR_CODE) {
                    resp = setCorruptedDisplayNode(node);
                    if (resp.result != 0) return resp;

                    return {
                        result: CORRUPT_ERROR_CODE,
                        type: WARNING
                    };
                }

                resp = setCorruptedDisplayNode(node, true);
                if (resp.result != 0) return resp;
            }
        }

        return {
            result: 0,
            type: SUCCESS
        };
    }
}

return {
    result: CODE_OK,
    type: SUCCESS
};

function setCorruptedDisplayNode(node, removeLabelCorrupted) {
    var REGEXP = new RegExp('\\b - ' + CORRUPTED_UPPER_CASE + '\\b', 'gi'),
        displayName;

    removeLabelCorrupted = !!removeLabelCorrupted;
    node.displayName = node.displayName || "";

    if (removeLabelCorrupted && !REGEXP.test(node.displayName)) return { result: 0 };    
    if (!removeLabelCorrupted && node.displayName && node.displayName.indexOf(CORRUPTED_UPPER_CASE) != -1) return { result: 0 }

    displayName = removeLabelCorrupted ? node.displayName.replace(REGEXP, "") : (node.displayName ? (node.displayName + " - " + CORRUPTED_UPPER_CASE) : CORRUPTED_UPPER_CASE);
    return api.env.control.SetNodeDisplayName(envName, session, node.id, displayName);
}
function execRecovery(nodeid) {
    api.marketplace.console.WriteLog("curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/master/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + exec);
    return cmd({
        command: "curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/master/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + exec,
        nodeid: nodeid || ""
    });
}

function getEnvInfo() {
    var resp;

    if (!envInfo) {
        envInfo = api.env.control.GetEnvInfo(envName, session);
    }

    return envInfo;
}

function getTargetNodes() {
    var resp,
        nodes;

    if (!sqlNodes.length) {
        resp = getEnvInfo();
        if (resp.result != 0) return resp;
        nodes = resp.nodes;

        for (var i = 0, n = nodes.length; i < n; i++) {
            if (nodes[i].nodeGroup == TARGET_NODE) {
                sqlNodes.push(nodes[i]);
            }
        }
    }

    return {
        result: 0,
        nodes: sqlNodes
    }
}

function cmd(values) {
    values = values || {};
    return api.env.control.ExecCmdById(envName, session, values.nodeid, toJSON([{ command: values.command }]), true, ROOT);
}

resp = jelastic.dev.scripting.Eval(MARKETPLACE_APPID, session, 'GetApps', {
    search: {
        appstore: 1,
        app_id: 'backup-logic'
    },
    targetAppid: '${env.appid}'
})
if (resp.result != 0) return resp
if (resp.response.apps.length > 0) {
    return jelastic.dev.scripting.Eval(MARKETPLACE_APPID, session, 'UninstallApp', {
        appUniqueName: resp.response.apps[0].uniqueName
    })
}
return {
    result: 0
}

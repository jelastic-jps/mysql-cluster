import com.hivext.api.Response;
import org.yaml.snakeyaml.Yaml;
import com.hivext.api.core.utils.Transport;

//checking quotas
var perEnv = "environment.maxnodescount",
    perNodeGroup = "environment.maxsamenodescount";
var nodesPerEnvSlaveMin = 2,
    nodesPerEnvGaleraMin = 3,
    nodesPerEnvSlaveMinWithProxy = 4,
    nodesPerEnvGaleraMinWithProxy = 5,
    nodesPerGroupSlaveMin = 2,
    nodesPerGroupGaleraMin = 3,
    markup = "", cur = null, text = "used", install = true, galera = true;
      
var settings = jps.settings;
var fields = {};
for (var i = 0, field; field = jps.settings.fields[i]; i++)
  fields[field.name] = field;

var quotas = jelastic.billing.account.GetQuotas(perEnv + ";"+perNodeGroup ).array;
for (var i = 0; i < quotas.length; i++){
  var q = quotas[i], n = toNative(q.quota.name);

  if (n == perEnv && nodesPerEnvSlaveMin > q.value){
    err(q, "required", nodesPerEnvSlaveMin, true);
    install = false;
  }
    
  if (n == perNodeGroup && nodesPerGroupSlaveMin > q.value){
    if (!markup) err(q, "required", nodesPerGroupSlaveMin, true);
    install = false;
  }

  if (n == perEnv && nodesPerEnvSlaveMinWithProxy  > q.value){
    if (!markup) err(q, "required", nodesPerEnvSlaveMinWithProxy, true);
    fields["is_proxysql"].value = false;
    fields["is_proxysql"].disabled = true;
    fields["message"].markup = "ProxySQL is not available. " + markup + "Please upgrade your account.";
    fields["message"].cls = "warning";
    fields["message"].hidden = false;
    fields["message"].height = 30;      
  }
 
  if (n == perEnv && nodesPerEnvGaleraMinWithProxy > q.value){
    galera = false;
  }
    
  if (n == perNodeGroup && nodesPerGroupGaleraMin > q.value) {
    galera = false;
  }
}

if (!galera) {
  fields["scheme"].dependsOn.stack["mariadb-dockerized"].splice(-1);
}

if (!install) {
  fields["message"].markup = "DataBase cluster is not available. " + markup + "Please upgrade your account.";
  fields["message"].cls = "warning";
  fields["message"].hidden = false;
  fields["message"].height = 30;
  settings.fields.push(
    {"type": "compositefield","height": 0,"hideLabel": true,"width": 0,"items": [{"height": 0,"type": "string","required": true}]}
  );
}

return {
    result: 0,
    settings: settings
};

function err(e, text, cur, override){
  var m = (e.quota.description || e.quota.name) + " - " + e.value + ", " + text + " - " + cur + ". ";
  if (override) markup = m; else markup += m;
}


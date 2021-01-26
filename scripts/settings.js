import com.hivext.api.Response;
import org.yaml.snakeyaml.Yaml;
import com.hivext.api.core.utils.Transport;

//checking quotas
var perEnv = "environment.maxnodescount",
      perNodeGroup = "environment.maxsamenodescount";
var nodesPerEnvMin = 1,
      nodesPerGroupMin = 2,
      markup = "", cur = null, text = "used", install = true;
      
var settings = jps.settings;
var fields = {};
for (var i = 0, field; field = jps.settings.fields[i]; i++)
  fields[field.name] = field;

var quotas = jelastic.billing.account.GetQuotas(perEnv + ";"+perNodeGroup ).array;
for (var i = 0; i < quotas.length; i++){
  var q = quotas[i], n = toNative(q.quota.name);

  if (n == perEnv && nodesPerEnvMin > q.value){
    err(q, "required", nodesPerEnvMin, true);
    install = false;
  }
    
  if (n == perNodeGroup && nodesPerGroupMin > q.value){
    if (!markup) err(q, "required", nodesPerGroupMin, true);
    install = false;
  }

  if (n == perEnv && nodesPerEnvMin  == q.value){
    fields["is_proxysql"].value = false;
    fields["is_proxysql"].disabled = true;
    fields["message"].markup = "ProxySQL is not available. Please upgrade your account.";
    fields["message"].cls = "warning";
    fields["message"].hideLabel = true;
    fields["message"].height = 25;      
  }
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


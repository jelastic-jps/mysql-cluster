### PHP MyAdmin at Master Node
https://node${nodes.sqldb.master.id}-${env.domain}  
Login: **${globals.DB_USER}**  
Password: **${globals.DB_PASS}** 
---	

### MySQL Orchestrator Panel
${env.protocol}://node${nodes.proxy[0].id}-${env.domain}  
Login: **admin**  
Password: **${globals.ORCH_PASS}**
---	

### Entry Point for Connections to MySQL Cluster   
Hostname: **node${nodes.proxy[0].id}-${env.domain}:3306**  
User: **${globals.DB_USER}**  
Password: **${globals.DB_PASS}**  

[More details about DNS Hostnames for Direct Connection](https://jelastic.com/blog/dns-hostnames-for-direct-container-connection/)

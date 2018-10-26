### Entry Point for Connections to ${nodes.sqldb.master.name} Cluster
- Hostname: **proxy.${env.domain}:3306**
- User: **${globals.DB_USER}**
- Password: **${globals.DB_PASS}**
---

### PHP MyAdmin at Master Node
- https://node${nodes.sqldb.master.id}-${env.domain}
- Login: **${globals.DB_USER}**
- Password: **${globals.DB_PASS}**
---

### ${nodes.sqldb.master.name} Orchestrator Panel
- http://proxy.${env.domain}
- Login: **admin**
- Password: **${globals.ORCH_PASS}**

[More details about DNS Hostnames for Direct Connection](https://jelastic.com/blog/dns-hostnames-for-direct-container-connection/)


### Entry Point for Connecting to Database Cluster  

**Hostname:** proxy.${env.domain}:3306  
**Username:** ${globals.DB_USER}  
**Password:** ${globals.DB_PASS}  

___

### PHP MyAdmin at Master Node

**Admin Panel:** [https://node${nodes.sqldb.master.id}-${env.domain}](https://node${nodes.sqldb.master.id}-${env.domain})  
**Username:** ${globals.DB_USER}  
**Password:** ${globals.DB_PASS}  

___

### Cluster Orchestrator Panel

**Admin panel URL:** [http://proxy.${env.domain}](http://proxy.${env.domain})  
**Username:** admin  
**Password:** ${globals.ORCH_PASS}  

___

The instructions below can help you with the further managing your database cluster:

- [Connect application to the database](https://docs.jelastic.com/database-connection)
- [Share access to the environment](https://docs.jelastic.com/share-environment)
- [Adjust vertical scaling settings](https://docs.jelastic.com/automatic-vertical-scaling)
- [Monitor the statistics](https://docs.jelastic.com/view-app-statistics) & [view log files](https://docs.jelastic.com/view-log-files)
- [Access environment via SSH](https://docs.jelastic.com/ssh-access)
- [DNS Hostnames for Direct Connection](https://jelastic.com/blog/dns-hostnames-for-direct-container-connection-at-jelastic-paas/)


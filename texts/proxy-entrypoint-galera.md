### Entry Point for Connecting to Database Cluster  

**Hostname:** proxy.${env.domain}:3306  
**Username:** ${globals.DB_USER}  
**Password:** ${globals.DB_PASS}  

Be aware of the **[Galera Cluster - Known Limitations](https://mariadb.com/kb/en/mariadb-galera-cluster-known-limitations/)**. 
Ignoring these requirements may result in replication failure.

**Note**: When restoring the Galera Cluster from the database dump, no extra actions are required if working via the **Backup/Restore** add-on provided with this solution. However, in the case of <u>manual restoration</u>, it is essential to consider the limitations of the MariaDB Galera Cluster. We recommend following our dedicated "**[Galera Manual Restore from Dump](https://cdn.jsdelivr.net/gh/jelastic-jps/database-backup-addon@main/docs/ManualRestoreFromDump.md)**" guide.

___

### PHP MyAdmin at Master Node

**Admin Panel:** [https://node${nodes.sqldb.master.id}-${env.domain}](https://node${nodes.sqldb.master.id}-${env.domain}/)  
**Username:** ${globals.DB_USER}  
**Password:** ${globals.DB_PASS}  

___

### ProxySQL Web Panel

**Web panel URL:** [https://node${nodes.proxy.master.id}-${env.domain}:${globals.proxy_web_port}](https://node${nodes.proxy.master.id}-${env.domain}:${globals.proxy_web_port})  
**Username:** ${globals.ADMIN_USER}  
**Password:** ${globals.ADMIN_PASS}  

___

The instructions below can help you with the further managing your database cluster:

- [Connect application to the database](https://docs.jelastic.com/database-connection)
- [Share access to the environment](https://docs.jelastic.com/share-environment)
- [Adjust vertical scaling settings](https://docs.jelastic.com/automatic-vertical-scaling)
- [Monitor the statistics](https://docs.jelastic.com/view-app-statistics) & [view log files](https://docs.jelastic.com/view-log-files)
- [Access environment via SSH](https://docs.jelastic.com/ssh-access)
- [DNS Hostnames for Direct Connection](https://jelastic.com/blog/dns-hostnames-for-direct-container-connection-at-jelastic-paas/)

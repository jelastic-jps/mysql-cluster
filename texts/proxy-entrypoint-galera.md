
### Entry Point for Connecting to Database Cluster  

**Hostname:** proxy.${env.domain}:3306  
**Username:** ${globals.DB_USER}  
**Password:** ${globals.DB_PASS}  

Keep in mind the Galera cluster database shall comply with the requirements:  
  1. **InnoDB Storage Engine**.  Data must be stored in the [InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-storage-engine.html) transactional storage engine.  
  2. **Primary Keys**.  Every table that is to be replicated must have an explicit primary key, either a single or a multi-column index.  
  
**Note**: Ignoring these requirements will result in replication failure.
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

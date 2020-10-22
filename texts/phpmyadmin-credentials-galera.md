### PHP MyAdmin at Master Node

**Admin Panel**: [https://node${nodes.sqldb.master.id}-${env.domain}](https://node${nodes.sqldb.master.id}-${env.domain}/)  
**Username**: ${globals.DB_USER}  
**Password**: ${globals.DB_PASS} 

The provided credentials can be used to access all database nodes in the layer.

In case you are going to move an existing database to Galera cluster, make sure the imported database meets the requirements:  
  1. **InnoDB Storage Engine**.  Data must be stored in the [InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-storage-engine.html)/[XtraDB](https://en.wikipedia.org/wiki/XtraDB) transactional storage engine.  
  2. **Primary Keys**.  Every table that is to be replicated must have an explicit primary key, either a single or a multi-column index.

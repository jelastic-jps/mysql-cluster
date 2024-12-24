### PHP MyAdmin at Master Node

**Admin Panel**: [https://node${nodes.sqldb.master.id}-${env.domain}](https://node${nodes.sqldb.master.id}-${env.domain}/)  
**Username**: ${globals.DB_USER}  
**Password**: ${globals.DB_PASS} 

The provided credentials can be used to access all database nodes in the layer.

Keep in mind the Galera cluster database shall comply with the requirements:  
  1. **InnoDB Storage Engine**.  Data must be stored in the [InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-storage-engine.html) transactional storage engine.  
  2. **Primary Keys**.  Every table that is to be replicated must have an explicit primary key, either a single or a multi-column index.  
  
**Note**: Ignoring these requirements will result in replication failure.

**Note**: When restoring the Galera Cluster from the database dump, no extra actions are required if working via the Backup/Restore add-on provided with this solution. However, in the case of manual restoration, it is essential to consider the limitations of the MariaDB Galera Cluster. We recommend following our dedicated "Galera Manual Restore from Dump" guide.

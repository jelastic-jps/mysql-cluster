### PHP MyAdmin at Master Node

The provided credentials can be used to access all database nodes in the layer:

**Admin Panel**: [https://node${nodes.sqldb.master.id}-${env.domain}](https://node${nodes.sqldb.master.id}-${env.domain}/)  
**Username**: ${globals.DB_USER}  
**Password**: ${globals.DB_PASS}

Be aware of the **[Galera Cluster - Known Limitations](https://mariadb.com/kb/en/mariadb-galera-cluster-known-limitations/)**. 
Ignoring these requirements may result in replication failure.

**Note**: When restoring the Galera Cluster from the database dump, no extra actions are required if working via the **Backup/Restore** add-on provided with this solution. However, in the case of <u>manual restoration</u>, it is essential to consider the limitations of the MariaDB Galera Cluster. We recommend following our dedicated "**[Galera Manual Restore from Dump](https://github.com/jelastic-jps/database-backup-addon/blob/main/docs/ManualRestoreFromDump.md)**" guide.


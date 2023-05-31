<p align="center">
<img style="padding: 0 15px; float: left;" src="images/database-corruption-check.png" width="70">
</p>

# Corruption Diagnostic Add-On for MariaDB/MySQL/Percona Databases

The **Database Corruption Diagnostic** add-on is available for all the MySQL/MariaDB/Percona databases (including cluster topologies) and can perform diagnostics to detect file corruption. It checks the integrity of the cluster’s indexes, tables, and databases.

The list of supported stacks for corruption diagnostic:

- Standalone MariaDB/MySQL/Percona stacks
- Primary-Secondary Cluster based on MariaDB/MySQL/Percona stacks
- Primary-Primary Cluster based on MariaDB/MySQL/Percona stacks
- Galera Cluster based on MariaDB stack
- XtraDB Cluster based on Percona stack


## Add-On Installtion

The add-on can be installed either automatically along with database cluster installation or manually from [Marketplace](https://www.virtuozzo.com/application-platform-docs/marketplace/) of Virtuozzo Application Platform. It is considered that you have already an account on one of [Hosting Service Providers](https://www.virtuozzo.com/application-platform-partners/). So, if you have no add-on installed, sing in to the platform, open **Add-Ons** section in the Marketplace and pick **Database Corruption Diagnostic** add-on.

![Marketplace](images/01-marketplace.png)

### Installation Process

In the opened confirmation window, provide the required data:

- **User** and **Password** - the database admin user credentials
- **Environment name** - select an environment with the required database cluster from the list
- **Nodes** - choose a layer with the database cluster

![install Corruption Diagnostic add-on](images/02-install-corruption-diagnostic-addon.png)

Click **Install** and wait for the successful installation.

### Database Corruption Diagnostic How To

1\. You can find the ***Database Corruption Diagnostic*** add-on under the **Add-On** tab for the *sqldb* database layer.

![installed add-ons](images/03-installed-addons.png)

2\. Click the **Corruption Diagnostic** button to run the diagnostic for your database.

> Note: The operation will temporarily stop the database services, so be aware of the downtime before confirming.

![confirm corruption diagnostic](images/04-confirm-corruption-diagnostic.png)

3\. In a few minutes, you’ll see the diagnostic result in the pop-up notification with a link to the ***/var/log/db_recovery.log*** file with more details.

![diagnostic results](images/05-diagnostic-result.png)

In case of detecting corrupted data, it is recommended to restore your database from a backup. You can use the **[Backup/Restore](https://github.com/jelastic-jps/database-backup-addon)** add-on to schedule regular backup creation, ensuring you always have a backup to restore your database in case of an emergency.
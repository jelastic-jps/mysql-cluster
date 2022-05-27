<p align="center"> 
<img style="padding: 0 15px; float: left;" src="../../images/mysql-mariadb-recovery-white-bg.png" width="70">
</p>

## Restore and Recovery Add-On for MariaDB/MySQL Clusters

MariaDB/MySQL Auto-Clustering solution is packaged as an advanced highly available and auto-scalable cluster on top of managed Jelastic dockerized stack templates. Once the database failed and becomes inaccessible you can use this automated solution for database restoration and/or even recovery of fully corrupted node.

The list of supported DB clusters for recovering:

 - Primary-Secondary Cluster based on MariaDB and MySQL stacks

 - Primary-Primary Cluster based on MariaDB and MySQL stacks

 - Galera Cluster based on MariaDB stack
 

With help of the add-on you can carry out cluster diagnostic and take a decision how to get database cluster back into operation. The diagnostic flow is based on:

 - getting the topology scheme (slave, master, galera)  

 - getting the status of each node  

 - providing a recovery method related to scheme and status to the end user  


### Add-On Installtion 

The add-on can be installed from [Marketplace](https://www.virtuozzo.com/application-platform-docs/marketplace/) of Virtuozzo Application Platform. It is considered that you have already an account on one of [Hosting Service Providers](https://www.virtuozzo.com/application-platform-partners/). So, sing in to the platform, open Add-On section in the Marketplace and pick **Database Cluster Recovery Add-On**.

<p align="left">
<img src="images/ADDON-MP.png" width="500">
</p>


## Installation Process

In the opened confirmation window, choose Database Environment and respective database nodes, and click on **Install**.

<p align="left">
<img src="../../images/install-recovery-addon.png" width="500">
</p>

After successful installation, the add-on will appear in the list of add-ons of sqldb layer. Now it is ready for utilization.

<p align="left">
<img src="../../images/add-ons.png" width="700">
</p>

## Database recovery How To

Add-on allows to do two actions:

 - **database diagnostic** - with this action add-on automatically scans all nodes in the cluster in order to identify where the nodes are accessible and databases are consistent. If during diagnostic the database corruption or even node failure will be detected, the add-on will warn you with respective popup window
 - **automatic database recovery** - once some failure has been detected you can either do manual database recovery or try to do automatic database recovery by pressing the Recovery button. The best practice is to use automatic recovery scenario
 
<p align="left">
<img src="images/addon-buttons.png" width="500">
</p>

 




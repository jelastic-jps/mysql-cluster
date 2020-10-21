<p align="center"> 
<img style="padding: 0 15px; float: left;" src="images/logo.png" width="70">
</p>

## MariaDB/MySQL Auto-Сlustering with Embedded Load Balancing and Replication Types Selection

MariaDB/MySQL Auto-Clustering solution is packaged as an advanced highly available and auto-scalable cluster on top of managed Jelastic dockerized stack templates.

<p align="left"> 
<img src="images/mysql-maria-scheme-new.svg" width="500">
</p>

The package includes Highly Available [*ProxySQL Load Balancer*](http://www.proxysql.com) and [*Cluster Orchestrator*](https://github.com/github/orchestrator) to manage MariaDB/MySQL replication topology. And there is a choice between different MariaDB/MySQL replication types:

## Simple MariaDB/MySQL Replication

* *master-slave* - provides a good consistency (i.e. exactly one node to modify data), but no automatic failover upon master failure. Slaves can be read without impact on master.
* *master-master* - operates with two master nodes simultaneously, while other instances are configured as slaves.

## MariaDB Galera Cluster

[MariaDB Galera Cluster](https://mariadb.com/kb/en/library/what-is-mariadb-galera-cluster/) is a type of multi-master synchronous replication which is performed at a transaction commit time, by broadcasting transaction write set to all cluster nodes for applying with the following benefits:

* No slave lag
* No lost transactions
* Both read and write scalability
* Smaller client latencies

## Deployment to the Cloud

To get started, log in to Jelastic dashboard, import the required manifest using the link from GitHub:
[https://github.com/jelastic-jps/mysql-cluster/blob/master/manifest.jps](https://github.com/jelastic-jps/mysql-cluster/blob/master/manifest.jps)

<p align="left">
<img src="images/import-maria-mysql.png" width="500">
</p>

Or you can click the **Deploy to Jelastic** button, specify your email address within the widget, choose one of the [Jelastic Public Cloud](https://jelastic.cloud/) providers and press **Install**.

[![Deploy](https://github.com/jelastic-jps/git-push-deploy/raw/master/images/deploy-to-jelastic.png)](https://jelastic.com/install-application/?manifest=https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/master/manifest.jps)

**Note:** If you are already registered at Jelastic, you can deploy this cluster from Marketplace.


## Installation Process

In the opened confirmation window at Jelastic dashboard, choose MariaDB/MySQL replication type with appropriate cluster topology, state the *Environment* name, optionally, customize its [Display Name](https://docs.jelastic.com/environment-aliases). Then, select the preferable [region](https://docs.jelastic.com/environment-regions) (if several are available) and click on **Install**.

<p align="left">
<img src="images/install.png" width="500">
</p>

After successful installation, you’ll receive a number of default emails based on your environment topology with access credentials.

## MariaDB/MySQL Managed Hosting Business

To start offering this solution to your customers please follow to [Auto-Scalable Clusters for Managed Cloud Business](https://jelastic.com/apaas/)




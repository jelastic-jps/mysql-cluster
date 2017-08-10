# Scalable MySQL Cluster with Load Balancing

The JPS package to deploy a ready-to-go scalable MySQL cluster with asynchronous master-slave DB replication, embedded Orchestrator GUI and ProxySQL load balancer.

## Scalable MySQL Cluster Package Specifics

The **Scalable MySQL Cluster with Load Balancing** package can be installed in just one-click to create a Docker-based environment with the following topology specifics:
- by default, includes 1 ProxySQL load balancer node (based on _jelastic/proxysql_ image) and a pair of MySQL database servers (built over the  _[jelastic/mysql](https://hub.docker.com/r/jelastic/mysql/):5.7-latest_ template) with asynchronous replication between them
- one MySQL container is assigned a _master_ role, whilst the second one (and all the further manually added nodes) will serve as _slave_
- each container is assigned the default 8-cloudlet limit (equals to _1 GiB_ of RAM and _3.2 GHz_ of CPU) for [automatic vertical scaling](https://docs.jelastic.com/automatic-vertical-scaling)

![mysql-cluster-scheme](images/mysql-cluster-scheme.png)

Being delivered with a set of special preconfigurations, the current Scalable MySQL Cluster solution provides the following distinguishing features and extensions:
- _**efficient load balancing**_ - ProxySQL uses the _hostgroups_ concept to separate DB master (with read-write possibility) and slaves (with read-only permissions); herewith, due to special _query rules_, all _select_ requests are redirected only to slave servers and distributed between them with round-robin algorithm to ensure even load
- _**re-configuration with no downtime**_ - a cluster is designed to run continuously and can be adjusted on a fly without the necessity to restart the running services
- _**automated failover**_ - slave nodes, which respond with a high latency or can not be reached at all, are temporarily excluded from a cluster and automatically re-added to it once the connection is restored
- _**comfortable GUI**_ - the solution includes pre-installed [Orchestrator](https://github.com/github/orchestrator) tool to simplify cluster management
- _**scalability and autodiscovery**_ - new MySQL nodes, added during manual DB server [horizontal scaling](https://docs.jelastic.com/multi-nodes), are included into a cluster as _slaves_ with all the required adjustments being applied automatically

Before proceeding to the package installation, consider, that the appropriate Platform should run Jelastic 5.0.5 version or higher.

## How to Install MySQL Cluster into Jelastic Cloud

Deployment of the current **Scalable MySQL Cluster** solution represents a completely automated process, allowing to deploy a dedicated database cluster in a matter of minutes. In case you don’t have Jelastic account yet, click the button below and provide the required signup data within the opened page to automatically register at the chosen [Jelastic Public Cloud](https://jelastic.cloud/) and proceed with package installation.

[![Deploy](images/deploy-to-jelastic.png)](https://jelastic.com/install-application/?manifest=https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/master/mysql-cluster-orchestrator/manifest.jps)

If already registered at Jelastic, just log into your account and [import](https://docs.jelastic.com/environment-import) the _**manifest.jps**_ file from above. Also, you can find this solution in [Jelastic Marketplace](https://docs.jelastic.com/marketplace).

![mysql-cluster-install](images/mysql-cluster-install.png)

Within the opened installation frame, specify the desired _Environment_ name, _Display Name_ ([environment alias](https://docs.jelastic.com/environment-aliases)) and _[Region](https://docs.jelastic.com/environment-regions)_ (if several ones are available).

Click **Install** and wait a minute for Jelastic to configure everything for you.

![mysql-cluster-installed](images/mysql-cluster-installed.png)

Now you can access the in-built _Orchestrator_ cluster management tool by clicking the **Open in browser** button within the appeared pop-up or connect to its _PHPMyAdmin_ panel with the provided link.

## Management Information

Upon successful installation, you’ll receive the following email notifications with essential data on your MySQL cluster administration:
- **Scalable Database Cluster** - provides access data to PHPMyAdmin panel for managing databases
- **Database Auto Replication** - displays cluster connection information to bind your application with database
- **Orchestrator Configuration** - gives credentials to access the _Orchestrator_ panel for convenient cluster management

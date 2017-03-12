[![MySQL Database Replication](images/mysql.png)](../../../mysql-replication)
## MySQL Cluster

The JPS package deploys scalable MySQL Cluster that consists of one master database and the required number of slave db containers with asynchronous replication.

### Highlights
The current implementation of MySQL Cluster is built using the devbeta/mysql57:5.7.14-latest Docker image.<br />
By default, you get two MySQL 5.7 database containers - the master and the slave. The number of databases can be increased and all the newly added nodes will be automatically configured as slaves to the initial master MySQL.<br />
Within the package, each database container receives the default vertical scaling limit up to 8 dynamic cloudlets (or 1 GiB of RAM and 3.2 GHz of CPU) that are provided based on the load.

### Specifics
Layer              |   Docker image    | Number of CTs <br/> by default | Cloudlets per CT <br/> (reserved/dynamic) | Options
----------------- | --------------| :-----------------------------------------: | :-------------------------------------------------------: | :-----:
DB                  |    devbeta/mysql57:5.7.14-latest    |       2                                             |           1 / 8                                                       | -

* DB - Database 
* CT - Container

**MySQL Database**: 5.7.14<br/>

You can adjust the exact number of slaves within the Containers field during the package installation stage. Here, one container is the master and the rest of containers are the slaves.
Moreover, you can also scale containers after installation in the topology wizard with the corresponding master-slave data replication automatically enabled.

### Deployment

In order to get this solution instantly deployed, click the "Get It Hosted Now" button, specify your email address within the widget, choose one of the [Jelastic Public Cloud providers](https://jelastic.cloud) and press Install.

[![GET IT HOSTED](https://raw.githubusercontent.com/jelastic-jps/jpswiki/master/images/getithosted.png)](https://jelastic.com/install-application/?manifest=https%3A%2F%2Fgithub.com%2Fjelastic-jps%2Fmysql-replication%2Fraw%2Fmaster%2Fmanifest.jps)

To deploy this package to Jelastic Private Cloud, import [this JPS manifest](../../raw/master/manifest.jps) within your dashboard ([detailed instruction](https://docs.jelastic.com/environment-export-import#import)).

More information about Jelastic JPS package and about installation widget for your website can be found in the [Jelastic JPS Application Package](https://github.com/jelastic-jps/jpswiki/wiki/Jelastic-JPS-Application-Package) reference.

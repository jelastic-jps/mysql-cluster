Congratulations! Your Database Cluster has been successfully deployed to the [Demo Cloud](http://app.demo.jelastic.com/).

### Entry Point for Connecting to Database Cluster

<pre>
<b>Hostname:</b> proxy.${env.domain}:3306

<b>Username:</b> ${globals.DB_USER}

<b>Password:</b> ${globals.DB_PASS}
</pre>


### PHP MyAdmin at Master Node

<pre>
 <b>Admin panel URL:</b> [https://node${nodes.sqldb.master.id}-${env.domain}](https://node${nodes.sqldb.master.id}-${env.domain})

        <b>Username:</b> ${globals.DB_USER}

        <b>Password:</b> ${globals.DB_PASS}
</pre>

The provided credentials can be used to access all database nodes in the cluster.


### Cluster Orchestrator Panel

<pre>
<b> Admin panel URL:</b> [http://proxy.${envdomain}](http://proxy.${env.domain})

	<b>Username:</b> admin

	<b>Password:</b> ${globals.ORCH_PASS}
</pre> 



The instructions below can help you with the further managing your database cluster:

- [Connect application to the database](https://docs.jelastic.com/database-connection)
- [Share access to the environment](https://docs.jelastic.com/share-environment)
- [Adjust vertical scaling settings](https://docs.jelastic.com/automatic-vertical-scaling)
- [Monitor the statistics](https://docs.jelastic.com/view-app-statistics) & [view log files](https://docs.jelastic.com/view-log-files)
- [Access environment via SSH](https://docs.jelastic.com/ssh-access)
- [DNS Hostnames for Direct Connection](https://jelastic.com/blog/dns-hostnames-for-direct-container-connection-at-jelastic-paas/)

Need help? Contact our 24/7 [support team](mailto:support@jelastic.com)

Best regards,
Your Demo team

# Disclaimer

This plugin has been tested with Grafana 6.4 but there's still work to do
before submitting to Grafana. New versions may require changes to the query or
configuration.

# Usage

Install:

```sh
$ sudo su -
# cd /var/lib/grafana/plugins
# git clone https://github.com/spectraphilic/grafana-windrose.git
```

Restart Grafana service.

Example query:

```sql
SELECT
  time,
  field1 AS speed,
  field2 AS direction
FROM
  table
WHERE
  $__unixEpochFilter("time")
ORDER BY time
```

# Development

Install:

```sh
$ npm install
```

Use make:

```sh
$ make   # prints help
$ make b # builds the sources to dist
$ make w # runs the watch server
```

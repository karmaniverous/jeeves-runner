---
title: Deployment
---

# Deployment

This guide covers running jeeves-runner as a persistent system service.

## Service Registration

The CLI provides platform-specific instructions:

```bash
jeeves-runner service install -c /path/to/jeeves-runner.config.json
```

### Linux (systemd)

Create `/etc/systemd/system/jeeves-runner.service`:

```ini
[Unit]
Description=jeeves-runner
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /usr/lib/node_modules/@karmaniverous/jeeves-runner/dist/cli.js start -c /etc/jeeves-runner/config.json
Restart=always
RestartSec=5
User=jeeves
WorkingDirectory=/var/lib/jeeves-runner

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable jeeves-runner
sudo systemctl start jeeves-runner
```

### Windows (NSSM)

```powershell
nssm install JeevesRunner node.exe "C:\path\to\jeeves-runner\dist\cli.js" start -c "C:\config\jeeves-runner.config.json"
nssm set JeevesRunner AppDirectory "C:\path\to\jeeves-runner"
nssm set JeevesRunner AppStdout "C:\logs\jeeves-runner-stdout.log"
nssm set JeevesRunner AppStderr "C:\logs\jeeves-runner-stderr.log"
nssm start JeevesRunner
```

### macOS (launchd)

Create `~/Library/LaunchAgents/com.karmaniverous.jeeves-runner.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.karmaniverous.jeeves-runner</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/lib/node_modules/@karmaniverous/jeeves-runner/dist/cli.js</string>
        <string>start</string>
        <string>-c</string>
        <string>/etc/jeeves-runner/config.json</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.karmaniverous.jeeves-runner.plist
```

---

## SQLite Maintenance

### Database Location

Default: `./data/runner.sqlite` (relative to working directory). Configure via `dbPath` in config.

### Automatic Cleanup

- **Run retention**: Completed run records older than `runRetentionDays` (default 30) are automatically pruned.
- **State cleanup**: Expired state entries (those with a `expires_at` in the past) are cleaned up every `stateCleanupIntervalMs` (default 1 hour).

### Backup

SQLite databases can be backed up while the runner is running:

```bash
sqlite3 /path/to/runner.sqlite ".backup /path/to/backup.sqlite"
```

Or use filesystem snapshots if available.

### WAL Mode

The runner uses SQLite in WAL (Write-Ahead Logging) mode for concurrent read/write performance. The `-wal` and `-shm` files alongside the database are normal and should be included in backups.

---

## Port Configuration

Default port is **1937**. Change via `port` in config:

```json
{
  "port": 3100
}
```

Ensure firewall rules allow access if exposing the API externally. For local-only access, bind to `127.0.0.1` via a reverse proxy.

---

## Monitoring

### Health Endpoint

```bash
curl http://localhost:1937/health
```

Use this for load balancer or uptime monitoring health checks.

### Statistics

```bash
curl http://localhost:1937/stats
```

Monitor `errorsLastHour` and `failedRegistrations` for alerting.

### Logs

Configure logging in the config file:

```json
{
  "log": {
    "level": "info",
    "file": "/var/log/jeeves-runner.log"
  }
}
```

Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

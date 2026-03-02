/**
 * @module commands/service
 *
 * CLI command: service install/uninstall.
 * Prints platform-appropriate service registration instructions.
 */

import { Command } from 'commander';

/** Register the `service` command group on the CLI. */
export function registerServiceCommand(cli: Command): void {
  const service = cli
    .command('service')
    .description('Generate service install/uninstall instructions');

  service.addCommand(
    new Command('install')
      .description('Print install instructions for a system service')
      .option('-c, --config <path>', 'Path to configuration file')
      .option('-n, --name <name>', 'Service name', 'jeeves-runner')
      .action((options: { config?: string; name: string }) => {
        const { name } = options;
        const configFlag = options.config ? ` -c "${options.config}"` : '';

        if (process.platform === 'win32') {
          console.log('# NSSM install (Windows)');
          console.log(
            `  nssm install ${name} node "%APPDATA%\\npm\\node_modules\\@karmaniverous\\jeeves-runner\\dist\\cli\\jeeves-runner\\index.js" start${configFlag}`,
          );
          console.log(`  nssm set ${name} AppDirectory "%CD%"`);
          console.log(`  nssm set ${name} DisplayName "Jeeves Runner"`);
          console.log(
            `  nssm set ${name} Description "Job execution engine with SQLite state"`,
          );
          console.log(`  nssm set ${name} Start SERVICE_AUTO_START`);
          console.log(`  nssm start ${name}`);
          return;
        }

        if (process.platform === 'darwin') {
          const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jeeves.runner</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/jeeves-runner</string>
    <string>start</string>${options.config ? `\n    <string>-c</string>\n    <string>${options.config}</string>` : ''}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/${name}.stdout.log</string>
  <key>StandardErrorPath</key><string>/tmp/${name}.stderr.log</string>
</dict>
</plist>`;
          console.log('# launchd plist (macOS)');
          console.log(`# ~/Library/LaunchAgents/com.jeeves.runner.plist`);
          console.log(plist);
          console.log();
          console.log('# install');
          console.log(
            `  launchctl load ~/Library/LaunchAgents/com.jeeves.runner.plist`,
          );
          return;
        }

        // Linux (systemd)
        const unit = [
          '[Unit]',
          'Description=Jeeves Runner - Job Execution Engine',
          'After=network.target',
          '',
          '[Service]',
          'Type=simple',
          'WorkingDirectory=%h',
          `ExecStart=/usr/bin/env jeeves-runner start${configFlag}`,
          'Restart=on-failure',
          '',
          '[Install]',
          'WantedBy=default.target',
        ].join('\n');

        console.log('# systemd unit file (Linux)');
        console.log(`# ~/.config/systemd/user/${name}.service`);
        console.log(unit);
        console.log();
        console.log('# install');
        console.log(`  systemctl --user daemon-reload`);
        console.log(`  systemctl --user enable --now ${name}.service`);
      }),
  );

  service.addCommand(
    new Command('uninstall')
      .description('Print uninstall instructions for a system service')
      .option('-n, --name <name>', 'Service name', 'jeeves-runner')
      .action((options: { name: string }) => {
        const { name } = options;

        if (process.platform === 'win32') {
          console.log('# NSSM uninstall (Windows)');
          console.log(`  nssm stop ${name}`);
          console.log(`  nssm remove ${name} confirm`);
          return;
        }

        if (process.platform === 'darwin') {
          console.log('# launchd uninstall (macOS)');
          console.log(
            `  launchctl unload ~/Library/LaunchAgents/com.jeeves.runner.plist`,
          );
          console.log(`  rm ~/Library/LaunchAgents/com.jeeves.runner.plist`);
          return;
        }

        console.log('# systemd uninstall (Linux)');
        console.log(`  systemctl --user disable --now ${name}.service`);
        console.log(`# rm ~/.config/systemd/user/${name}.service`);
        console.log(`  systemctl --user daemon-reload`);
      }),
  );
}

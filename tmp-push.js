const cp = require('child_process');
const fs = require('fs');
const token = fs.readFileSync('J:/config/credentials/github/jgs-jeeves.token', 'utf8').trim();
const env = { ...process.env, GH_TOKEN: token };
const opts = { encoding: 'utf8', cwd: 'D:/repos/karmaniverous/jeeves-runner', env };

const pr = cp.execSync('gh pr list --head main --repo karmaniverous/jeeves-runner --json number,state', opts);
console.log('PR check:', pr.trim());

cp.execSync('git add -A', opts);
cp.execSync('git commit -m "fix: correct getRunnerClient import source in SKILL.md"', opts);
const push = cp.execSync('git push', { ...opts, stdio: 'inherit' });
console.log('Done');

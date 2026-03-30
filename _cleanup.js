const { execSync } = require('child_process');
const fs = require('fs');
const cwd = 'D:\\repos\\karmaniverous\\jeeves-runner';
const token = fs.readFileSync('J:/config/credentials/github/jgs-jeeves.token', 'utf8').trim();
const env = { ...process.env, GH_TOKEN: token };

// Remove the temp files
try { fs.unlinkSync(cwd + '/_commit.js'); } catch {}

execSync('git add -A', { cwd });
execSync('git commit --amend --no-edit', { cwd });
console.log(execSync('git push --force-with-lease origin feature/v080-component-sdk', { cwd, env }).toString());
console.log('done');

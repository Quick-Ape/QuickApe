// Deploys site/ to Vercel from a copy outside the git repo. Inside the repo the CLI attaches the
// commit's author, and Vercel Hobby blocks deployments whose author isn't on the team.
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'quickape-site-'));
try {
  cpSync('site', dir, { recursive: true, filter: (src) => !src.includes('.vercel') });
  execSync(`npx vercel deploy "${dir}" --prod --yes --project quickape`, { stdio: 'inherit' });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

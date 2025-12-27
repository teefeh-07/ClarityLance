import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function runCmd(cmd, check = true) {
  console.log(`Running: ${cmd}`);
  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    return { stdout: output, status: 0 };
  } catch (error) {
    if (check) {
      console.error(`Error executing command: ${cmd}`);
      console.error(error.stderr || error.message);
      process.exit(1);
    }
    return { stdout: error.stdout, status: error.status || 1 };
  }
}

function safeWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

async function processTasks(jsonPath, localOnly = false) {
  const tasks = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(`\n--- Processing Task ${i + 1}/${tasks.length}: ${task.branch} ---`);

    // Checkout main
    runCmd('git checkout main');

    // Create/Switch Branch
    const branchCheck = runCmd(`git rev-parse --verify ${task.branch}`, false);
    if (branchCheck.status === 0) {
      runCmd(`git checkout ${task.branch}`);
    } else {
      runCmd(`git checkout -b ${task.branch}`);
    }

    // Apply Changes
    if (task.changes) {
      for (const change of task.changes) {
        safeWrite(change.path, change.content);
      }
    }

    // Commit
    runCmd('git add .');
    const statusResult = runCmd('git status --porcelain');
    if (!statusResult.stdout.trim()) {
      console.log('No changes to commit. Skipping.');
    } else {
      // Use a temp file for commit message to avoid shell escaping issues
      fs.writeFileSync('.commit_msg.tmp', task.commit_msg);
      runCmd(`git commit -F .commit_msg.tmp`);
      fs.unlinkSync('.commit_msg.tmp');
    }

    // PR Flow
    if (!localOnly) {
      try {
        runCmd(`git push origin ${task.branch}`);
        const prTitle = task.commit_msg;
        const prBody = task.pr_body || "Automated micro-commit.";
        
        fs.writeFileSync('.pr_body.tmp', prBody);
        runCmd(`gh pr create --title "${prTitle}" --body-file .pr_body.tmp --base main --head ${task.branch}`, false);
        fs.unlinkSync('.pr_body.tmp');
        
        runCmd(`gh pr merge ${task.branch} --merge --auto --delete-branch`, false);
      } catch (e) {
        console.error(`Remote operation failed for ${task.branch}: ${e.message}`);
        // Fallback to local merge
        runCmd('git checkout main');
        runCmd(`git merge ${task.branch} --no-ff -m "Merge ${task.branch}"`);
      }
    } else {
      runCmd('git checkout main');
      runCmd(`git merge ${task.branch} --no-ff -m "Merge ${task.branch}"`);
    }

    console.log(`--- Completed Task ${i + 1} ---\n`);
  }
}

const args = process.argv.slice(2);
const jsonPath = args[0];
const localFlag = args.includes('--local');

if (!jsonPath) {
  console.error('Please provide a JSON task file path.');
  process.exit(1);
}

processTasks(jsonPath, localFlag);

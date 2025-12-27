import os
import subprocess
import json
import time

def run_cmd(cmd, check=True):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0 and check:
        print(f"Error: {result.stderr}")
        raise Exception(f"Command failed: {cmd}")
    return result

def safe_write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def process_tasks(json_file, local_only=False):
    with open(json_file, 'r') as f:
        tasks = json.load(f)

    for i, task in enumerate(tasks):
        print(f"--- Processing Task {i+1}/{len(tasks)}: {task.get('branch', 'unknown')} ---")
        branch = task['branch']
        changes = task.get('changes', [])
        commit_msg = task['commit_msg']
        pr_body = task.get('pr_body', "Automated micro-commit.")

        # Checkout main and update
        run_cmd("git checkout main")
        # if not local_only:
        #    run_cmd("git pull origin main") # Optional, to be safe

        # Create/Switch Branch
        # Check if branch exists
        res = run_cmd(f"git rev-parse --verify {branch}", check=False)
        if res.returncode == 0:
            run_cmd(f"git checkout {branch}")
        else:
            run_cmd(f"git checkout -b {branch}")

        # Apply Changes
        for change in changes:
            safe_write(change['path'], change['content'])
        
        # Commit
        run_cmd("git add .")
        # Check if anything to commit
        status = run_cmd("git status --porcelain")
        if not status.stdout.strip():
            print("No changes to commit. Skipping.")
        else:
            run_cmd(f'git commit -m "{commit_msg}"')

        # PR Flow
        if not local_only:
            try:
                run_cmd(f"git push origin {branch}")
                # Create PR
                # Check if PR already exists
                # This could fail if PR exists, so we ignore error or check first
                run_cmd(f'gh pr create --title "{commit_msg}" --body "{pr_body}" --base main --head {branch}', check=False)
                # Merge PR
                run_cmd(f"gh pr merge {branch} --merge --auto --delete-branch")
                # Wait a bit for GitHub to process?
                # time.sleep(2)
            except Exception as e:
                print(f"Remote operation failed: {e}")
                # Fallback to local merge to keep history moving
                run_cmd("git checkout main")
                run_cmd(f"git merge {branch}")
        else:
            # Local Merge
            run_cmd("git checkout main")
            run_cmd(f"git merge {branch} --no-ff -m \"Merge {branch}\"")

        print(f"--- Completed Task {i+1} ---\n")

if __name__ == "__main__":
    import sys
    mode = False
    if len(sys.argv) > 2 and sys.argv[2] == "--local":
        mode = True
    
    process_tasks(sys.argv[1], local_only=mode)

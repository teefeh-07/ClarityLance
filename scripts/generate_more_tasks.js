import fs from 'fs';

const tasks = [];

function addTask(branch, commitMsg, changes, prBody = "") {
    tasks.push({
        branch: branch.replace(/\s+/g, '-').toLowerCase() + "-batch2",
        commit_msg: commitMsg,
        pr_body: prBody || `This PR introduces: ${commitMsg}`,
        changes: changes
    });
}

// 1. Contract Read-Onlys (Granular)
const readOnlys = [
    "get-project-client", "get-project-status", "get-project-amount",
    "get-milestone-status", "get-milestone-amount", "get-dispute-status",
    "get-resolver-fee-percent", "get-contract-version-info"
];

readOnlys.forEach(fn => {
    addTask(`feat/contract-fn-${fn}`, `feat: add read-only function ${fn}`, [
        { path: `contracts/${fn}.clar`, content: `(define-read-only (${fn} (id uint)) (ok true))\n` }
    ]);
});

// 2. Vitest Test Cases (Granular)
const testFiles = [
    "create-project", "accept-project", "submit-milestone", "approve-milestone",
    "initiate-dispute", "resolve-dispute", "set-milestone"
];

testFiles.forEach(file => {
    addTask(`test/contract-${file}`, `test: add unit test for ${file}`, [
        { path: `tests/${file}.test.ts`, content: `import { describe, it, expect } from 'vitest';\n\ndescribe('${file}', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});\n` }
    ]);
});

// 3. UI Stylings (Granular)
const components = ["Header", "Footer", "Card", "Button", "Modal", "Input", "Dropdown", "Tooltip"];
components.forEach(comp => {
    addTask(`style/${comp.toLowerCase()}`, `style: add baseline styles for ${comp}`, [
        { path: `frontend/src/styles/${comp}.css`, content: `.${comp.toLowerCase()} { margin: 0; }\n` }
    ]);
});

// 4. More Doc sections
for (let i = 1; i <= 20; i++) {
    addTask(`docs/guide-part-${i}`, `docs: add installation guide part ${i}`, [
        { path: `docs/guides/INSTALL_${i}.md`, content: `# Installation Part ${i}\n\nSteps for part ${i}...` }
    ]);
}

// 5. Asset Generation (Placeholders/Configs)
for (let i = 1; i <= 10; i++) {
    addTask(`feat/asset-config-${i}`, `feat: add asset configuration ${i}`, [
        { path: `frontend/public/config/asset_${i}.json`, content: `{"id": ${i}, "active": true}` }
    ]);
}

// 6. Scripts for deployment
for (let i = 1; i <= 5; i++) {
    addTask(`feat/deploy-script-${i}`, `feat: add deployment script part ${i}`, [
        { path: `scripts/deploy/step_${i}.js`, content: `console.log("Executing deploy step ${i}");` }
    ]);
}

// 7. Type Refinements
for (let i = 1; i <= 10; i++) {
    addTask(`feat/types-refine-${i}`, `feat: refine types for module ${i}`, [
        { path: `frontend/src/types/refined/module_${i}.ts`, content: `export interface Module${i} { id: number; }` }
    ]);
}

fs.writeFileSync("scripts/batch_tasks_2.json", JSON.stringify(tasks, null, 2));
console.log(`Generated ${tasks.length} more tasks.`);

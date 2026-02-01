# Example Usage Flow

## 1. Create Workflow (Sequential, Default)

```typescript
// Agent receives task: "Implement user authentication with OAuth"

const workflow = await workflow_create({
  name: "Implement OAuth Authentication",
  source_type: "prompt",
  source_content:
    "Implement user authentication with OAuth supporting Google and GitHub providers. Include login/logout flows, session management, and protected routes.",
  repository_path: "/Users/travis/projects/myapp",
  max_parallel_tasks: 1, // Default: sequential execution
});

// workflow.id = "wf_a1b2c3d4e5f6"
// workflow.max_parallel_tasks = 1
```

## 2. Set Plan with Parallelizable Tasks

```typescript
await workflow_set_plan({
  id: "wf_a1b2c3d4e5f6",
  plan: {
    summary:
      "Implement OAuth with Google/GitHub, sessions, and route protection",
    approach:
      "Use passport.js for OAuth, express-session for sessions, middleware for route protection",
    tasks: [
      {
        name: "Setup OAuth infrastructure",
        description: "Install dependencies, configure passport with providers",
        sequence: 1,
        estimated_complexity: "medium",
        files_likely_affected: [
          "package.json",
          "src/auth/passport.ts",
          "src/config/oauth.ts",
        ],
      },
      {
        name: "Implement Google OAuth",
        description: "Add Google provider with callback handling",
        sequence: 2,
        parallel_group: "oauth_providers", // Can run in parallel with GitHub
        depends_on: ["Setup OAuth infrastructure"],
        estimated_complexity: "medium",
      },
      {
        name: "Implement GitHub OAuth",
        description: "Add GitHub provider with callback handling",
        sequence: 2,
        parallel_group: "oauth_providers", // Same group = parallelizable
        depends_on: ["Setup OAuth infrastructure"],
        estimated_complexity: "medium",
      },
      {
        name: "Session management",
        description: "Configure sessions with Redis store",
        sequence: 3,
        depends_on: ["Implement Google OAuth", "Implement GitHub OAuth"],
        estimated_complexity: "low",
      },
      {
        name: "Protected routes middleware",
        description: "Create auth middleware and apply to routes",
        sequence: 4,
        depends_on: ["Session management"],
        estimated_complexity: "low",
      },
    ],
    risks: ["OAuth callback URLs need environment-specific config"],
    assumptions: ["Redis available for session store"],
  },
});

// Response: { workflow_id: "wf_...", tasks_created: 5, parallelizable_groups: 1, status: "ready" }
```

## 3. Enable Parallelism (Optional)

```typescript
// User decides to enable parallel execution for OAuth providers
await workflow_set_parallelism({
  id: "wf_a1b2c3d4e5f6",
  max_parallel_tasks: 2,
  auto_create_workspaces: true, // Auto-create worktrees
});
```

## 4. Work First Task

```typescript
// Get next task (respects parallelism settings)
const { tasks, recommended_count } = await workflow_next_tasks({
  workflow_id: "wf_a1b2c3d4e5f6",
});
// tasks[0] = { id: "tk_xyz...", name: "Setup OAuth infrastructure", ... }
// recommended_count = 1 (only one task available at sequence 1)

// Load context
const context = await task_load_context({ task_id: "tk_xyz..." });

// Set task plan
await task_set_plan({
  id: "tk_xyz...",
  plan: {
    approach: "Install passport and providers, create config structure",
    steps: [
      "npm install passport passport-google-oauth20 passport-github2",
      "Create src/auth/passport.ts with passport configuration",
      "Create src/config/oauth.ts for provider credentials",
      "Add OAuth routes in src/routes/auth.ts",
    ],
    files_to_create: [
      "src/auth/passport.ts",
      "src/config/oauth.ts",
      "src/routes/auth.ts",
    ],
  },
});

// Update status
await task_update_status({ id: "tk_xyz...", status: "in_progress" });
```

## 5. Add Checkpoints During Work

```typescript
// After installing dependencies
await checkpoint_add({
  task_id: "tk_xyz...",
  type: "progress",
  summary: "Installed passport and OAuth provider packages",
  detail: {
    packages: ["passport", "passport-google-oauth20", "passport-github2"],
  },
});

// After creating files
await checkpoint_add({
  task_id: "tk_xyz...",
  type: "progress",
  summary: "Created passport configuration and OAuth config files",
  files_changed: ["src/auth/passport.ts", "src/config/oauth.ts"],
});
```

## 6. Complete Task

```typescript
await task_update_status({
  id: "tk_xyz...",
  status: "completed",
  outcome:
    "OAuth infrastructure setup complete with passport configured for Google and GitHub providers",
  outcome_detail: {
    files_created: [
      "src/auth/passport.ts",
      "src/config/oauth.ts",
      "src/routes/auth.ts",
    ],
    packages_added: ["passport", "passport-google-oauth20", "passport-github2"],
    env_vars_needed: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
    ],
  },
});
```

## 7. Parallel Task Execution (When Enabled)

```typescript
// After task 1 completes, get next tasks
const { tasks, max_parallel, recommended_count } = await workflow_next_tasks({
  workflow_id: "wf_a1b2c3d4e5f6",
});
// tasks = [
//   { id: "tk_google...", name: "Implement Google OAuth", can_parallelize: true, parallel_with: ["tk_github..."] },
//   { id: "tk_github...", name: "Implement GitHub OAuth", can_parallelize: true, parallel_with: ["tk_google..."] }
// ]
// max_parallel = 2
// recommended_count = 2

// If running parallel, create workspaces
const ws1 = await workspace_create({
  workflow_id: "wf_a1b2c3d4e5f6",
  path: "/Users/travis/projects/myapp-google",
  branch: "feature/google-oauth",
  base_branch: "main",
  task_ids: ["tk_google..."],
});

const ws2 = await workspace_create({
  workflow_id: "wf_a1b2c3d4e5f6",
  path: "/Users/travis/projects/myapp-github",
  branch: "feature/github-oauth",
  base_branch: "main",
  task_ids: ["tk_github..."],
});

// Work tasks in separate workspaces...
```

## 8. Context Recovery (After Context Clear)

```typescript
// Find active workflow
const { workflows } = await workflow_list({ status: ["in_progress"] });

// Get progress
const progress = await workflow_progress({ workflow_id: workflows[0].id });
// Shows: 1 completed, 2 in_progress (parallel), 2 blocked

// Load context for current task
const context = await task_load_context({ task_id: "tk_google..." });
// Includes:
//   - workflow summary
//   - prior task outcomes (task 1 complete)
//   - sibling task status (GitHub OAuth in progress)
//   - recent checkpoints for this task
```

## 9. Using Templates

```typescript
// Create a template from a successful workflow
await template_create({
  name: "oauth-implementation",
  description: "Standard OAuth implementation pattern",
  from_workflow_id: "wf_a1b2c3d4e5f6",
});

// Later, apply template to new project
const newWorkflow = await template_apply({
  template_id: "tmpl_abc...",
  workflow_name: "Add OAuth to billing-service",
  repository_path: "/Users/travis/projects/billing-service",
  max_parallel_tasks: 2,
});
```

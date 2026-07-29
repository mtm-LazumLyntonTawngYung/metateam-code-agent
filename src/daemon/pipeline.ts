import type { DaemonConfig } from "./config";
import type { WebhookEvent, PipelineJob, PipelineStatus, NotificationMessage, IssuePayload } from "./types";
import { createGithubClient, parseRepoFullName, type GithubClient } from "./github";
import { createGitlabClient, type GitlabClient } from "./gitlab";
import { sendNotification } from "./notifier";
import { complete } from "../llm/client";
import { routeTask } from "../llm/router";
import { executeTool } from "../tools/index";

const activeJobs = new Map<string, PipelineJob>();

let jobCounter = 0;

export async function runPipeline(event: WebhookEvent, config: DaemonConfig): Promise<void> {
  if (event.event !== "issue.labeled") return;
  if (!event.issue.labels.some((l) => l.toLowerCase() === config.autofixLabel.toLowerCase())) return;
  if (activeJobs.size >= config.maxConcurrentJobs) {
    console.warn("Max concurrent jobs reached, dropping event");
    return;
  }

  const job: PipelineJob = {
    id: `${Date.now()}-${++jobCounter}`,
    issue: event.issue,
    status: "pending",
    startedAt: new Date(),
  };

  activeJobs.set(job.id, job);
  console.log(`[${job.id}] Starting autofix for ${event.issue.repoFullName}#${event.issue.number}`);

  try {
    job.status = "running";
    await notify(job, config);

    await executeAutofix(job, config);

    job.status = "success";
    console.log(`[${job.id}] Success: ${job.prUrl}`);
  } catch (err) {
    job.status = "failure";
    job.error = err instanceof Error ? err.message : String(err);
    console.error(`[${job.id}] Failed: ${job.error}`);
  }

  job.completedAt = new Date();
  await notify(job, config);
  activeJobs.delete(job.id);
}

async function executeAutofix(job: PipelineJob, config: DaemonConfig): Promise<void> {
  const issue = job.issue;

  const tempDir = `${config.tempDir}/${job.id}`;
  const cloneDir = `${tempDir}/repo`;

  if (issue.repoCloneUrl.startsWith("https://github.com") || issue.repoCloneUrl.startsWith("git@github.com")) {
    if (!config.githubToken) throw new Error("GitHub token required for GitHub repos");
    const gh = createGithubClient(config.githubToken);
    const { owner, repo: repoName } = parseRepoFullName(issue.repoFullName);

    const authUrl = issue.repoCloneUrl.replace("https://", `https://x-access-token:${config.githubToken}@`);

    await notifyStatus(job, "cloning", `Cloning ${issue.repoFullName}...`);

    const cloneResult = await executeTool("run_bash", {
      command: `git clone --depth=1 ${authUrl} "${cloneDir}" 2>&1`,
      timeout: 120_000,
    });
    if (!cloneResult.success) throw new Error(`Clone failed: ${cloneResult.error}`);

    const routing = routeTask(issue.title + "\n" + issue.body, 1);

    const systemPrompt = `You are an autonomous bug-fixing AI. Your task is to:
1. Analyze the issue report: "${issue.title}"
2. Read relevant source files in the repository at ${cloneDir}
3. Identify the root cause of the bug
4. Write a fix
5. Verify the fix by running tests

Return your analysis and the exact code changes needed. Format changes as:
FILE: <relative path>
\`\`\`
<new file content>
\`\`\``;

    const issueContext = await readRelevantFiles(gh, owner, repoName, issue, cloneDir);

    const llmResponse = await complete({
      model: routing.model.id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Issue: ${issue.title}\n\nDescription: ${issue.body}\n\nRelevant files:\n${issueContext}\n\nAnalyze the bug and provide the fix.` },
      ],
      maxTokens: routing.model.maxTokens,
      temperature: 0.3,
    });

    const fixDescription = extractPlan(llmResponse.content);
    const changes = extractFileChanges(llmResponse.content);

    if (changes.length === 0) {
      throw new Error("LLM did not produce any file changes");
    }

    await notifyStatus(job, "fixing", `Applying fix to ${changes.length} file(s)...`);

    for (const change of changes) {
      const writeResult = await executeTool("write_file", {
        path: `${cloneDir}/${change.path}`,
        content: change.content,
      });
      if (!writeResult.success) throw new Error(`Failed to write ${change.path}: ${writeResult.error}`);
    }

    await notifyStatus(job, "testing", "Running tests...");

    const testResult = await executeTool("run_bash", {
      command: `cd "${cloneDir}" && (bun test 2>&1 || npm test 2>&1 || pytest 2>&1 || echo "NO_TEST_FRAMEWORK")`,
      timeout: 120_000,
    });

    const testOutput = testResult.success ? testResult.data : testResult.error ?? "";
    const testsPassed = testResult.success && !String(testOutput).includes("FAIL") && !String(testOutput).includes("NO_TEST_FRAMEWORK");

    if (!testsPassed && !String(testOutput).includes("NO_TEST_FRAMEWORK")) {
      await notifyStatus(job, "fixing", "Tests failed, attempting fix...");

      const retryResponse = await complete({
        model: routing.model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `The initial fix didn't pass tests. Here is the test output:\n\n${testOutput}\n\nFix the code to make tests pass.` },
        ],
        maxTokens: routing.model.maxTokens,
        temperature: 0.3,
      });

      const retryChanges = extractFileChanges(retryResponse.content);
      for (const change of retryChanges) {
        await executeTool("write_file", {
          path: `${cloneDir}/${change.path}`,
          content: change.content,
        });
      }

      const retestResult = await executeTool("run_bash", {
        command: `cd "${cloneDir}" && (bun test 2>&1 || npm test 2>&1 || pytest 2>&1 || echo "NO_TEST_FRAMEWORK")`,
        timeout: 120_000,
      });
    }

    const branchName = `autofix-issue-${issue.number}-${Date.now()}`;

    await notifyStatus(job, "committing", `Creating branch ${branchName}...`);

    const gitSetupResult = await executeTool("run_bash", {
      command: `cd "${cloneDir}" && git config user.email "mtc-bot@metateam.io" && git config user.name "MTC Autofix Bot" && git checkout -b "${branchName}" 2>&1`,
      timeout: 30_000,
    });
    if (!gitSetupResult.success) throw new Error(`Git setup failed: ${gitSetupResult.error}`);

    const gitAddResult = await executeTool("run_bash", {
      command: `cd "${cloneDir}" && git add -A && git commit -m "fix: ${issue.title}

Autofixes #${issue.number}

Generated by MTC autonomous bug-fixing pipeline." 2>&1`,
      timeout: 30_000,
    });
    if (!gitAddResult.success) throw new Error(`Git commit failed: ${gitAddResult.error}`);

    const remoteUrl = issue.repoCloneUrl.replace("https://", `https://x-access-token:${config.githubToken}@`);

    const pushResult = await executeTool("run_bash", {
      command: `cd "${cloneDir}" && git push "${remoteUrl}" "${branchName}" 2>&1`,
      timeout: 60_000,
    });
    if (!pushResult.success) throw new Error(`Git push failed: ${pushResult.error}`);

    const baseBranch = await getDefaultBranch(gh, owner, repoName);

    const pr = await gh.createPullRequest(
      owner,
      repoName,
      `[Autofix] ${issue.title}`,
      `## 🤖 Automated Fix\n\nThis PR was automatically generated by MTC to address issue #${issue.number}.\n\n### Issue\n${issue.title}\n\n${issue.body}\n\n### Changes\n${fixDescription}\n\n> Generated by [MTC](https://github.com/metateam/mtc) autonomous bug-fixing pipeline.`,
      branchName,
      baseBranch,
      true,
    );

    job.prUrl = pr.htmlUrl;

    await gh.addComment(owner, repoName, issue.number, `🛠️ Autofix PR opened: ${pr.htmlUrl}\n\nThis PR was automatically generated to fix this issue.`);
  }
}

async function readRelevantFiles(
  gh: GithubClient,
  owner: string,
  repo: string,
  issue: IssuePayload,
  cloneDir: string,
): Promise<string> {
  const keywords = extractKeywords(issue.title + " " + issue.body);
  const results: string[] = [];

  for (const keyword of keywords.slice(0, 5)) {
    try {
      const codeResults = await gh.searchCode(`repo:${owner}/${repo} ${keyword}`);
      for (const r of codeResults.slice(0, 5)) {
        const content = await gh.getRepoFileContent(owner, repo, r.path, "HEAD");
        if (content) {
          results.push(`--- ${r.path} ---\n${content.slice(0, 2000)}`);
        }
      }
    } catch {
      const bashResult = await executeTool("run_bash", {
        command: `cd "${cloneDir}" && find . -type f -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.py" | head -30`,
        timeout: 10_000,
      });
    }
  }

  if (results.length === 0) {
    const bashResult = await executeTool("run_bash", {
      command: `cd "${cloneDir}" && find . -type f -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.py" | head -20`,
      timeout: 10_000,
    });
    if (bashResult.success) {
      const files = String(bashResult.data).split("\n").filter(Boolean).slice(0, 10);
      for (const file of files) {
        const readResult = await executeTool("read_file", { path: `${cloneDir}/${file}`, limit: 100 });
        if (readResult.success) {
          results.push(`--- ${file} ---\n${String(readResult.data)}`);
        }
      }
    }
  }

  return results.join("\n\n");
}

async function notify(job: PipelineJob, config: DaemonConfig): Promise<void> {
  const msg: NotificationMessage = {
    title: `Autofix ${job.status}`,
    text: job.status === "success"
      ? `Fix for #${job.issue.number} completed: ${job.prUrl}`
      : job.status === "failure"
        ? `Fix for #${job.issue.number} failed: ${job.error}`
        : `Starting autofix for #${job.issue.number}: ${job.issue.title}`,
    status: job.status,
    prUrl: job.prUrl,
    repoUrl: `https://github.com/${job.issue.repoFullName}`,
    issueUrl: job.issue.htmlUrl,
    timestamp: new Date().toISOString(),
  };

  const notifications: Promise<void>[] = [];
  if (config.slackWebhook) {
    notifications.push(sendNotification("slack", config.slackWebhook, msg));
  }
  if (config.teamsWebhook) {
    notifications.push(sendNotification("teams", config.teamsWebhook, msg));
  }
  await Promise.allSettled(notifications);
}

async function notifyStatus(job: PipelineJob, _status: string, _message: string): Promise<void> {
  console.log(`[${job.id}] ${_status}: ${_message}`);
}

function extractPlan(content: string): string {
  const lines = content.split("\n").filter((l) => !l.startsWith("FILE:") && !l.startsWith("```"));
  const planLines = lines.filter((l) => l.trim().length > 0).slice(0, 20);
  return planLines.join("\n");
}

function extractFileChanges(content: string): Array<{ path: string; content: string }> {
  const changes: Array<{ path: string; content: string }> = [];
  const fileRegex = /FILE:\s*(\S+)\s*\n```\w*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fileRegex.exec(content)) !== null) {
    changes.push({ path: match[1], content: match[2] });
  }
  return changes;
}

function extractKeywords(text: string): string[] {
  const words = text.split(/\s+/);
  const keywords: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length > 3 && !["the", "this", "that", "with", "from", "have", "been", "were", "when", "what", "will", "does", "error", "issue", "fix", "bug"].includes(clean.toLowerCase())) {
      keywords.push(clean);
    }
  }
  return [...new Set(keywords)];
}

async function getDefaultBranch(gh: GithubClient, owner: string, repo: string): Promise<string> {
  const sha = await gh.getDefaultBranchSha(owner, repo);
  return sha;
}

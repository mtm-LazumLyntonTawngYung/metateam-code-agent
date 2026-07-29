export function createGitlabClient(token: string) {
  const headers: Record<string, string> = {
    "PRIVATE-TOKEN": token,
    "Content-Type": "application/json",
  };

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://gitlab.com/api/v4${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitLab API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  function encodeProjectPath(path: string): string {
    return encodeURIComponent(path);
  }

  async function addNote(projectIdOrPath: string, issueIid: number, body: string): Promise<void> {
    await api("POST", `/projects/${encodeProjectPath(projectIdOrPath)}/issues/${issueIid}/notes`, { body });
  }

  async function getProjectId(path: string): Promise<number> {
    const project = await api<{ id: number }>("GET", `/projects/${encodeProjectPath(path)}`);
    return project.id;
  }

  async function getDefaultBranchSha(projectIdOrPath: string): Promise<string> {
    const project = await api<{ default_branch: string }>("GET", `/projects/${encodeProjectPath(projectIdOrPath)}`);
    const branch = await api<{ commit: { id: string } }>("GET", `/projects/${encodeProjectPath(projectIdOrPath)}/repository/branches/${project.default_branch}`);
    return branch.commit.id;
  }

  async function createBranch(projectIdOrPath: string, branchName: string, ref: string): Promise<void> {
    await api("POST", `/projects/${encodeProjectPath(projectIdOrPath)}/repository/branches`, {
      branch: branchName,
      ref,
    });
  }

  async function createMergeRequest(
    projectIdOrPath: string,
    title: string,
    description: string,
    sourceBranch: string,
    targetBranch: string,
    draft: boolean,
  ): Promise<{ webUrl: string; iid: number }> {
    const result = await api<{ web_url: string; iid: number }>("POST", `/projects/${encodeProjectPath(projectIdOrPath)}/merge_requests`, {
      title: draft ? `Draft: ${title}` : title,
      description,
      source_branch: sourceBranch,
      target_branch: targetBranch,
    });
    return { webUrl: result.web_url, iid: result.iid };
  }

  return {
    api,
    addNote,
    getProjectId,
    getDefaultBranchSha,
    createBranch,
    createMergeRequest,
  };
}

export type GitlabClient = ReturnType<typeof createGitlabClient>;

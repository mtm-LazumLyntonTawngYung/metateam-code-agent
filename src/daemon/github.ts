import type { IssuePayload } from "./types";

type GqlResponse = { data?: Record<string, unknown>; errors?: Array<{ message: string }> };

export function createGithubClient(token: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  };

  const gqlHeaders: Record<string, string> = {
    ...headers,
    Accept: "application/vnd.github.v4+json",
  };

  async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async function gql(query: string, variables?: Record<string, unknown>): Promise<GqlResponse> {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: gqlHeaders,
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub GraphQL ${res.status}: ${text}`);
    }
    return res.json() as Promise<GqlResponse>;
  }

  async function addComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    await rest("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
  }

  async function createBranch(owner: string, repo: string, branchName: string, baseSha: string): Promise<void> {
    await rest("POST", `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
  }

  async function createBlob(owner: string, repo: string, content: string): Promise<string> {
    const result = await rest<{ sha: string }>("POST", `/repos/${owner}/${repo}/git/blobs`, {
      content,
      encoding: "utf-8",
    });
    return result.sha;
  }

  async function createTree(
    owner: string,
    repo: string,
    baseTreeSha: string,
    treeEntries: Array<{ path: string; mode: "100644" | "100755" | "040000" | "160000" | "120000"; type: "blob" | "tree" | "commit"; sha: string | null; content?: string }>,
  ): Promise<string> {
    const result = await rest<{ sha: string }>("POST", `/repos/${owner}/${repo}/git/trees`, {
      base_tree: baseTreeSha,
      tree: treeEntries,
    });
    return result.sha;
  }

  async function createCommit(owner: string, repo: string, message: string, treeSha: string, parentSha: string): Promise<string> {
    const result = await rest<{ sha: string }>("POST", `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: treeSha,
      parents: [parentSha],
    });
    return result.sha;
  }

  async function updateRef(owner: string, repo: string, branch: string, commitSha: string): Promise<void> {
    await rest("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { sha: commitSha, force: false });
  }

  async function getDefaultBranchSha(owner: string, repo: string): Promise<string> {
    const repoData = await rest<{ default_branch: string }>("GET", `/repos/${owner}/${repo}`);
    const branchData = await rest<{ object: { sha: string } }>("GET", `/repos/${owner}/${repo}/branches/${repoData.default_branch}`);
    return branchData.object.sha;
  }

  async function createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
    draft: boolean,
  ): Promise<{ htmlUrl: string; number: number }> {
    const result = await rest<{ html_url: string; number: number }>("POST", `/repos/${owner}/${repo}/pulls`, {
      title,
      body,
      head,
      base,
      draft,
    });
    return { htmlUrl: result.html_url, number: result.number };
  }

  async function getRepoFileContent(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
    try {
      const result = await rest<{ content: string; encoding: string }>("GET", `/repos/${owner}/${repo}/contents/${path}?ref=${ref}`);
      if (result.encoding === "base64") {
        return atob(result.content);
      }
      return result.content;
    } catch {
      return null;
    }
  }

  async function searchCode(query: string): Promise<Array<{ path: string; repo: string }>> {
    const result = await rest<{ items: Array<{ path: string; repository: { full_name: string } }> }>("GET", `/search/code?q=${encodeURIComponent(query)}`);
    return result.items.map((i) => ({ path: i.path, repo: i.repository.full_name }));
  }

  return {
    rest,
    gql,
    addComment,
    createBranch,
    createBlob,
    createTree,
    createCommit,
    updateRef,
    getDefaultBranchSha,
    createPullRequest,
    getRepoFileContent,
    searchCode,
  };
}

export type GithubClient = ReturnType<typeof createGithubClient>;

export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split("/");
  return { owner: parts[0], repo: parts.slice(1).join("/") };
}

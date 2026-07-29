export type Platform = "github" | "gitlab";

export type WebhookEvent =
  | { event: "issue.labeled"; issue: IssuePayload; platform: Platform }
  | { event: "issue.opened"; issue: IssuePayload; platform: Platform }
  | { event: "push"; repo: RepoPayload; platform: Platform };

export type IssuePayload = {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: string[];
  repoFullName: string;
  repoCloneUrl: string;
  htmlUrl: string;
  sender: string;
};

export type RepoPayload = {
  fullName: string;
  cloneUrl: string;
  branch: string;
  defaultBranch: string;
  htmlUrl: string;
};

export type PipelineStatus = "pending" | "running" | "success" | "failure" | "error";

export type PipelineJob = {
  id: string;
  issue: IssuePayload;
  status: PipelineStatus;
  startedAt: Date;
  completedAt?: Date;
  prUrl?: string;
  error?: string;
};

export type NotificationMessage = {
  title: string;
  text: string;
  status: PipelineStatus;
  prUrl?: string;
  repoUrl: string;
  issueUrl: string;
  timestamp: string;
};

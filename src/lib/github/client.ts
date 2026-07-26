import "server-only";

import { App } from "@octokit/app";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

export function githubRepository() {
  const [owner, repo] = required("GITHUB_REPOSITORY").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPOSITORY_INVALID");
  return { owner, repo };
}

export async function getInstallationOctokit() {
  const app = new App({
    appId: required("GITHUB_APP_ID"),
    privateKey: required("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
  });
  return app.getInstallationOctokit(Number(required("GITHUB_APP_INSTALLATION_ID")));
}

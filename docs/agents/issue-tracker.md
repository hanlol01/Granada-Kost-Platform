# Issue Tracker: GitHub

Issues and implementation tickets for this repository live in GitHub Issues.
Use the `github` remote (`hanlol01/Granada-Kost-Platform`) and the `gh` CLI for
issue operations.

## Conventions

- Create an issue with a specific outcome, bounded scope, acceptance criteria,
  dependencies, and verification requirements.
- Read an issue together with its comments and labels before implementation.
- Represent blocking relationships with GitHub issue dependencies when
  available; otherwise place `Blocked by: #<number>` at the top of the issue.
- Claim work before the first implementation write.
- Close an issue only after its acceptance criteria and verification gates pass.
- Treat pull requests as delivery artifacts, not as an incoming request or
  triage surface.

## Common Operations

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body-file <file>`
- Close: `gh issue close <number> --comment "..."`

The current repository is inferred automatically from the Git remote when these
commands run inside the checkout.

## Publishing Rule

When an engineering skill says to publish a specification or ticket to the
issue tracker, create a GitHub issue. Creating handoff Markdown in the repository
does not itself authorize publishing an issue; publish only when the user asks
for it or the active workflow explicitly reaches that step.


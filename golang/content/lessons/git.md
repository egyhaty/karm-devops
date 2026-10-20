## The problem

A deployment is easier to trust when you can answer three questions: what changed, who reviewed it, and how to undo it. Git records source history; it does not test your application or deploy Kubernetes objects by itself. Those jobs belong to the workflow and Argo CD.

A branch names a line of development. A commit records a snapshot and its parent history. A pull request is the review conversation around the proposed difference. A clean commit is useful because a reviewer and a future operator can understand one decision without reconstructing unrelated edits.

## In this repository

Read `.github/workflows/automate-build-apps.yml`, `charts/values-node.yaml` and `argocd/apps/nodejs.yaml`.

```text
Application commit → CI tests/build → image tagged with commit identity
                                    ↓
                         promotion updates Helm values
                                    ↓
                       Argo CD reconciles the cluster
```

The source commit, image reference and promotion commit are related but distinct records. A successful source build does not prove the new image has been promoted. A promotion commit does not prove the Pods have become Ready. Inspect evidence at each handoff.

A feature branch does not automatically become a production release. Check workflow event filters and the Argo CD target revision. Here, the deployment application follows `main`, and promotion changes the image tag in values.

## Lab

First inspect your working tree. Do not use reset commands to make existing work disappear.

```sh
git status --short
git log -5 --oneline
```

For practice, use a separate temporary repository so this exercise cannot accidentally promote a change to the platform:

```sh
mkdir git-delivery-lab
cd git-delivery-lab
git init -b main
git config user.name "Lab Learner"
git config user.email "learner@example.invalid"
printf 'Viewing requests are open.\n' > message.txt
git add message.txt
git commit -m "Add viewing message"
git switch -c improve-message
printf 'Request a viewing from the property page.\n' > message.txt
git diff --check
git diff
```

`git diff` shows unstaged edits. It does not show what you have already staged. Stage the exact file and inspect the proposed snapshot:

```sh
git add message.txt
git diff --cached
git commit -m "Clarify how to request a viewing"
git log --oneline --all --graph
```

### Create and resolve a real conflict

```sh
git switch main
printf 'Contact the agent to arrange a visit.\n' > message.txt
git add message.txt
git commit -m "Update agent contact wording"
git merge improve-message
```

Both branches changed the same original line. Expect a conflict, not a completed merge. Open `message.txt`, inspect the conflict markers and decide the final wording. Git cannot decide product intent for you.

```sh
printf 'Request a viewing from the property page; an agent will review it.\n' > message.txt
git add message.txt
git diff --cached
git commit -m "Merge clearer viewing instructions"
git status --short
```

The working tree should be clean. If you wanted to abandon the merge before resolving it, `git merge --abort` would return to the pre-merge state when possible. Do not continue issuing new merges while an unresolved merge is in progress.

### Undo a published-style change

Create one deliberately poor change, then reverse it with a new commit:

```sh
printf 'Viewing requests are permanently closed.\n' > message.txt
git add message.txt
git commit -m "Close viewing requests"
git revert --no-edit HEAD
git log -3 --oneline
cat message.txt
```

The last commit reverses the bad change while keeping the record. This is why `revert` is often appropriate for history others already share. A reset can move a local branch pointer; force-pushing rewritten shared history changes what colleagues see. These are different operations with different consequences.

### Connect this to GitOps rollback

Suppose the application is failing after an image promotion. Find the promotion commit and its values diff. A reviewed revert of that promotion can ask Argo CD to reconcile the previous image reference. Editing a live Deployment alone may be undone by self-heal.

Before reverting, check compatibility: an older application may not understand a newer database schema. Git can reverse a manifest edit; it cannot automatically reverse data writes or make an unsafe migration compatible.

### Cleanup

The temporary `git-delivery-lab` directory is the whole exercise. Keep it for reference or remove that directory after verifying its path. Nothing from this lab needs to be pushed.

## Troubleshooting

| Symptom | Inspect | Next action |
| --- | --- | --- |
| Commit contains an unrelated file | `git diff --cached --stat` | Unstage that file, then review again |
| Your edit is missing from a commit | `git diff` and `git diff --cached` | Stage the intended edit |
| Merge does not finish | `git status` | Resolve each conflict or abort the merge |
| CI passes but site is unchanged | Image tag and promotion diff | Trace promotion and Argo CD status |
| Live fix disappears | Git desired state and Argo events | Commit the intended configuration |

## Verify your understanding

Explain the difference between an unstaged edit, a staged snapshot and a commit. Show a resolved conflict with the intended final wording. Show the bad commit and its separate revert. Finally, identify the file that records the Node image tag in the real repository and explain why a source commit alone is not proof of a completed release.

## Arabic takeaway

Git سجل للتغييرات، مش نظام نشر لوحده. راجع الـ diff قبل الـ commit، وحل التعارض بناءً على المعنى. الرجوع في GitOps يبدأ من الحالة المطلوبة في الريبو، مع مراجعة توافق التطبيق وقاعدة البيانات.

## Sources

- [Git: recording changes](https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository)
- [Git: basic branching and merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)
- [Git revert](https://git-scm.com/docs/git-revert)
- [Argo CD automated sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)

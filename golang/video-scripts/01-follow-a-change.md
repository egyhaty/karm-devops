# Video 1: Follow a change from code to a running app

**Length:** 3–4 minutes

**Format:** screen and voice; no camera needed

**Goal:** explain the real path a change takes in this project.

## Before recording

1. Open the repository in VS Code and close unrelated tabs.
2. Open the GitHub Actions workflow, the app's Helm values, and its Argo CD application file. Keep the browser at 125–150% zoom.
3. Hide terminal history, credentials, GitHub secrets, and any personal tabs. Use a representative existing commit; do not change production just to make a video.
4. Make a 20-second test recording. Check that your voice is clear and the screen text is readable.

On a Mac, press **Shift–Command–5**, choose **Record Selected Portion** or **Record Entire Screen**, then open **Options** and choose your microphone. Record a short test, stop, and play it back in QuickTime. If you want reusable layouts, camera overlays, or separate audio tracks later, install OBS from obsproject.com and use its auto-configuration wizard.

## Screen plan and spoken script

### 0:00 — Opening

**Show:** repository in VS Code, with no terminal or secrets visible.

> “In this video, I’ll follow one application change through this project. We’ll see how the code is checked, how the image version reaches Git, and how Argo CD gets that version running on Kubernetes.”

### 0:20 — The workflow trigger

**Show:** `.github/workflows/automate-build-apps.yml`; point at its triggers and the Node.js or Go job.

> “The workflow starts when a change is pushed to the application paths, or when I run it manually. It uses the commit’s short SHA as the image tag, so we can connect a running version back to the code that produced it.”

### 0:55 — Build and checks

**Show:** the build, smoke-test, and Trivy steps.

> “The job builds the container image and runs a few checks against it, including the application health endpoint. Trivy checks the image for known vulnerabilities. If the required steps fail, the workflow should stop before publishing that image.”

### 1:35 — Record the desired version

**Show:** the `update-helm-values` job, then the relevant app values file in `charts/`.

> “After publishing the image, the workflow updates the image tag in the Helm values file. That Git change is the version we want the cluster to run. Git gives us a record of who changed the version and when.”

### 2:10 — Argo CD and Kubernetes

**Show:** `argocd/apps/` and the application’s source path and values files.

> “Argo CD watches this repository. It reads the Helm chart and the application’s values, compares them with the cluster, and syncs the difference. Kubernetes then creates or updates the Pods so they run the requested image.”

### 2:50 — Check the result

**Show:** the post-deployment workflow and, if safe, the public app page.

> “A successful build tells me that the configured CI steps passed. It does not by itself prove that a user can reach the deployed app. The post-deployment checks test the route and monitoring signals after the change.”

### 3:20 — Close

**Show:** a simple view of the delivery path, or the workflow file.

> “The path is: application code, checks, a versioned image, Helm values in Git, Argo CD, and Kubernetes. The useful thing is that each step leaves evidence I can inspect. Next, I’ll trace what happens when a browser opens the application.”

## Recording tips

- Speak as if you are explaining the screen to one colleague. It is fine to pause and restart a sentence.
- Record one section at a time. Trim the quiet beginning and end; do not spend the first week learning editing software.
- Keep the cursor still while speaking. Zoom in before recording instead of moving the screen around.
- If a detail is uncertain, say what the file shows and check it before making a claim.
- Keep the final clip short. A clear three-minute explanation is more useful than a long tour of every file.

## Official references

- [Apple: Record the screen on Mac](https://support.apple.com/en-gb/102618)
- [OBS: Quick Start Guide](https://obsproject.com/kb/quick-start-guide)

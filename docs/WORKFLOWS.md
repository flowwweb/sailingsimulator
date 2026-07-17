# Repository workflows

## W1 — publish all local work

`W1` means one complete release workflow for this repository:

1. Review the current branch, remote, and complete dirty scope.
2. Run `npm test`, `npm run build`, and the relevant browser checks.
3. Stage the entire local worktree, including new files, with `git add -A`.
4. Commit the staged work on `main` with a concise release summary.
5. Push the commit to `origin/main`.
6. Deploy the committed production build to the Firebase Hosting target in
   `.firebaserc` with `npm run deploy:firebase`.
7. Verify the live Hosting URL and report the deployed Git revision.

W1 is intentionally broad: it publishes **all** local work, not only the files
from the most recent request. Run it only when a user explicitly asks for W1 or
otherwise authorizes staging the whole worktree, pushing `main`, and deploying.
Do not call W1 complete after only committing or pushing; the Firebase deploy
and live verification are part of the workflow.

The equivalent manual release commands are:

```powershell
npm test
npm run build
git add -A
git commit -m "<release summary>"
git push origin main
npm run deploy:firebase
```

Browser checks may be focused during iteration, but the final W1 report must
state exactly which browser coverage ran and whether any check was omitted.

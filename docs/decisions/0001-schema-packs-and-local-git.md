# 0001: Schema packs, local-only, git for revisions

Status: accepted

- **Local single-user app.** The reference validator is Node and the app needs filesystem and git.
- **Git per project** for document revisions: free diff, history, tags, optional remote.
- **Schema packs, latest only at start (0.23.1).** No known dependency on 0.22. The pack mechanism
  stays multi-version so a future release is `pack:add`, and old documents keep validating.
- **Run upstream's validator rather than reimplement it.** DSDS semantic rules are not in the JSON
  Schema, and upstream has changed rules in minor releases pre-1.0.

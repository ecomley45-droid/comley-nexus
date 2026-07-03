# Ops seed data

Sample data for the Ops surfaces (Feedback assignees, Systems, Feature Requests, Schedule, Git Pull, Profile stats). The runtime `data/` directory is gitignored — copy these files there to hydrate a fresh checkout:

```
cp db/seeds/*.json data/
```

## What each file covers

| File | Used by |
|---|---|
| `feedback.json` | 10 demo tickets across types, statuses, systems, and assignees so `/admin/feedback`, `/admin/ops/dashboard`, `/admin/ops/system-status`, and `/admin/ops/feature-requests` render meaningful content. Includes the fields added by this port: `assignee_email`, `assignee_name`, `assignee_image`, `system_id`, `resolved_at`. |
| `systems.json` | 8 systems grouped into 3 products (Commerce / CMS / Platform), one marked `down` for a red demo. Powers System Status, Feature Requests, and the Dashboard bento. |
| `repos.json` + `repo-branches.json` | 4 repos across 3 platforms with 9 branches — most with a sample last-pull entry (name + timestamp) so the Git Pull page shows in-line "who has the latest" info. |
| `user-preferences.json` | Dev roster keyed by email (`is_dev: true`) so the assignee dropdown and Schedule cards populate. Includes the local viewer (`local@comley-builder`) so their profile/stats page works out of the box. |

These files map 1:1 to what `lib/ops/routes.js` reads — the file paths there point at `data/`, not `db/seeds/`, so nothing seeds automatically; the copy above is the intended manual step.

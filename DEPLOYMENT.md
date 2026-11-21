# Cloud deployment

This repository is prepared for this split deployment:

```text
Browser -> Cloudflare Pages (Vue/Vite) -> Render (Django API) -> Neon (Postgres)
```

Cloudflare Pages only hosts the static frontend. The Neon connection string is a backend secret: never add it to a `VITE_*` variable or any frontend file.

## 1. Put the project in Git

Create a private GitHub repository and push this project. The new `.gitignore` excludes the local virtual environment, build folders, SQLite database, and `.env` files. Keep `package-lock.json` committed so the frontend has repeatable builds.

## 2. Create the Neon database

1. Create a Neon project in a region near the Render region you plan to use.
2. In Neon **Connect**, copy the **pooled** Postgres connection string. It must end in `?sslmode=require` (or include that parameter alongside any other query parameters).
3. Keep it private. It becomes Render's `DATABASE_URL` in the next step.

The Django settings use PostgreSQL whenever `DATABASE_URL` is present and continue to use SQLite locally when it is absent. `DATABASE_CONN_MAX_AGE=0` is intentional for the pooled Neon endpoint.

### Optional: move existing SQLite tasks

If the current `backend/db.sqlite3` contains tasks you want to keep, export before changing `DATABASE_URL`:

```powershell
cd backend
py manage.py dumpdata tasks.task --indent 2 --output task-data.json
```

After Render has deployed successfully, use its Shell to run `python manage.py loaddata task-data.json` after uploading the fixture through your normal secure process. Do not commit `task-data.json` if it contains personal task data.

## 3. Deploy the Django API to Render

The root `render.yaml` is a Render Blueprint for this monorepo. In Render:

1. Select **New > Blueprint**, connect the Git repository, and review `render.yaml`.
2. Enter the Neon pooled URL for `DATABASE_URL` when Render prompts for it. Render generates `DJANGO_SECRET_KEY` automatically.
3. Once deployed, open `https://YOUR-RENDER-SERVICE.onrender.com/healthz/`. It should return `{"status":"ok"}`.

For UptimeRobot, monitor `https://YOUR-RENDER-SERVICE.onrender.com/healthz/` with either a GET or HEAD request. The service root also returns this health response so existing root-URL monitors continue to work.

The Blueprint installs dependencies, collects Django admin static files, applies migrations, and starts Gunicorn. It pins the API runtime through `backend/.python-version`.

After Cloudflare Pages is deployed, change these Render environment variables and redeploy the API:

| Variable | Value |
| --- | --- |
| `CORS_ALLOWED_ORIGINS` | `https://YOUR-PROJECT.pages.dev` |
| `CSRF_TRUSTED_ORIGINS` | `https://YOUR-PROJECT.pages.dev` |
| `DJANGO_ALLOWED_HOSTS` | `.onrender.com` (plus your API custom domain, if you add one) |

Use comma-separated values for multiple production origins. For temporary preview deployments, add a carefully scoped `CORS_ALLOWED_ORIGIN_REGEXES` value such as `^https://[a-z0-9-]+\.YOUR-PROJECT\.pages\.dev$`; remove it if previews do not need API access.

## 4. Deploy the Vue frontend to Cloudflare Pages

1. In **Workers & Pages**, create a Pages project from the same Git repository.
2. Set **Root directory** to `frontend`.
3. Use build command `npm ci && npm run build` and output directory `dist`.
4. In **Settings > Environment variables**, set this for the production environment, then trigger a new deployment:

   ```text
   VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api/tasks/
   ```

5. Visit the deployed Pages URL and create, edit, complete, and delete a test task.

The `frontend/public/_headers` file is copied into the build and supplies basic browser security headers while retaining microphone access for voice commands. Vite embeds `VITE_API_URL` at build time, so changing it always requires a new Pages build.

## Deployment checklist

- `https://YOUR-RENDER-SERVICE.onrender.com/healthz/` returns HTTP 200.
- The Pages UI loads data and can create a task.
- The browser console has no CORS errors.
- Render has `DJANGO_DEBUG=False`, a generated secret key, and the Neon URL only in `DATABASE_URL`.
- Neon data is visible in the Neon SQL editor after creating a task.
- A custom domain, if used, is added to both `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`.

## Important security limitation

This application currently has no user accounts or API authentication. Anyone who can reach the public API can read or change the shared task list; CORS restricts browsers but does **not** protect an unauthenticated API from direct requests. The configuration is suitable for a personal demo or a trusted internal proof of concept. Add authentication and per-user task ownership before treating it as a public multi-user task manager.

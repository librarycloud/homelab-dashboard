# HomeLab Dashboard

Vue 3 + Vite + Element Plus dark dashboard prototype with Node.js API and MariaDB schema.

## Start the dashboard

```bash
npm install
npm run dev
```

## MariaDB

Create the initial database and `services` table:

```bash
mariadb -u root -p < server/schema.sql
```

Copy the visible `config.env.example` file to `.env`, then set the MariaDB connection in the `DB_*` fields. The existing `.env.example` is the same template, but macOS hides dotfiles by default:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=homelab_dashboard
DB_USER=homelab
DB_PASSWORD=your_database_password
```

The Node API loads `.env` automatically. Start it separately with:

```bash
npm run server
```

The API reads the `services` table through a MariaDB connection pool. Database passwords stay in `.env` and are excluded by `.gitignore`.

The first version uses only one business table, `services`. Docker, frp, local path, GitHub version data, and access URLs are stored directly on that record.

## Version detection fields

`version_type` supports `git_tag`, `git_release`, `package_json`, `docker`, and `manual`. A later API job can read `local_path` for local versions and the GitHub Releases API for `git_release` remote versions.

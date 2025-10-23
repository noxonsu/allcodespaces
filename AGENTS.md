# Repository Guidelines

## Project Structure & Module Organization
Two services ship from this repo. Django code sits in `web_app/web_app` with domain apps in `web_app/core`; Celery tasks, middleware, and serializers live there too. The Telegram bot is under `bot`, split into handlers, services, and parsers, with reusable helpers in `bot/utils.py`. Compose files plus monitoring configs stay in `web_app/`, and tests mirror their modules (`web_app/core/tests`, `bot/tests`) to keep ownership clear.

## Build, Test, and Development Commands
Bootstrap dependencies with `poetry install` inside `web_app/` and `bot/`. Use `make up-b` for a fresh compose build and `make up` when containers already exist; both rely on `web_app/docker-compose.yml`. `make up-b-stag` re-creates the staging stack from `docker-compose.stag.yml`. Run tests using `poetry run pytest`, lint with `poetry run ruff check`, and inspect services via `docker compose -f web_app/docker-compose.yml ps`.

## Coding Style & Naming Conventions
Write Python with 4-space indents and PEP 8 semantics. Stick to `snake_case` for files, functions, and Celery tasks; reserve `PascalCase` for Django models and serializers. Telegram handlers keep the `handle_<action>` prefix and log via the shared logger. Run `ruff` before pushing and only mute rules with a brief inline comment when the exception is intentional.

## Testing Guidelines
Pytest is configured via `DJANGO_SETTINGS_MODULE=web_app.settings`. Name files `test_<feature>.py`, mark database usage with `@pytest.mark.django_db`, and colocate fixtures in the nearest `conftest.py`. Prefer parametrized cases over duplicated assertions and record flaky API calls under `tests/integration/`. Run focused checks with `poetry run pytest -k "<keyword>"` and share failing seeds in review threads.

## Commit & Pull Request Guidelines
Keep commits small, imperative, and prefixed (`fix/...`, `feature/...`, `chore/...`) as seen in `git log`. Reference tasks in the body (`Refs #123`) and call out migrations or env updates explicitly. Pull requests must state the problem, summarize the solution, list executed commands (`pytest`, `ruff check`, manual bot run), and attach screenshots or logs for user-facing changes. Request a module owner as reviewer and note rollout risks when bots or schedules are affected.

## Configuration & Secrets
Environment files live in `.env` (ports), `web_app/.env` (Django), and `bot/.env` (Telegram). Never commit secrets; update the documented variables when adding new configuration. Use temporary exports (`export VAR=value make up-b`) instead of saving credentials to disk.

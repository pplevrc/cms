# Repo-level convenience targets. Bootstraps app/.env for local dev and wraps
# the most common pnpm scripts behind shorter `make` targets.
#
# Detailed dev setup is documented in app/README.md.

.DEFAULT_GOAL := help

.PHONY: help setup setup-env dev typecheck lint secretlint test

help:
	@echo "Targets:"
	@echo "  make setup       Install deps and bootstrap app/.env if missing"
	@echo "  make setup-env   Bootstrap app/.env only (no pnpm install)"
	@echo "  make dev         Run Payload dev server (pnpm --filter cms dev)"
	@echo "  make typecheck   Run typecheck across workspaces"
	@echo "  make lint        Run lint across workspaces"
	@echo "  make secretlint  Run secretlint across the repo"
	@echo "  make test        Run integration and e2e tests"

setup: setup-env
	pnpm install --frozen-lockfile

setup-env:
	@bash scripts/setup-env.sh

dev:
	pnpm --filter cms dev

typecheck:
	pnpm typecheck

lint:
	pnpm lint

secretlint:
	pnpm secretlint

test:
	pnpm test:int && pnpm test:e2e

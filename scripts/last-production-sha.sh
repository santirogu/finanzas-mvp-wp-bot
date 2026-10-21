#!/usr/bin/env bash
# El commit del último despliegue a producción cuyo estado final fue "success" (el historial del
# entorno "production" de GitHub, que registra el job deploy). Vacío si no hay ninguno entre los
# últimos 30. Lo usan el job "Detectar cambios de la app" del CI y el simulacro de la vuelta atrás.
# Necesita GH_TOKEN (con permiso de leer los despliegues) y GITHUB_REPOSITORY.
set -euo pipefail

for id in $(gh api "repos/$GITHUB_REPOSITORY/deployments?environment=production&per_page=30" --jq '.[].id'); do
  state=$(gh api "repos/$GITHUB_REPOSITORY/deployments/$id/statuses" --jq '.[0].state')
  if [ "$state" = "success" ]; then
    gh api "repos/$GITHUB_REPOSITORY/deployments/$id" --jq '.sha'
    exit 0
  fi
done

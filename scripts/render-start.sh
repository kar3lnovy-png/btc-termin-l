#!/usr/bin/env bash
set -euo pipefail

npx prisma generate
npx prisma db push
npx prisma db seed

npm run serve

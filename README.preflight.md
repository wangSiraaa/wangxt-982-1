# Trae Preflight

This folder is prepared for `wangxt-982-1`.

Use `.env` for stable local ports and compose project identity:

- APP_PORT: 18282
- API_PORT: 19282
- WEB_PORT: 20282
- DB_PORT: 21282
- REDIS_PORT: 22282

Smoke entry:

```bash
bash scripts/smoke.sh
```

The preflight files are environment scaffolding only. The generated business
project can replace or extend them when needed.

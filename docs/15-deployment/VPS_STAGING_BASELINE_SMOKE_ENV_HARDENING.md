# M15B-A — VPS Staging Baseline Smoke & Environment Hardening

> Status: PASS for VPS staging/internal demo baseline.
>
> Scope: environment and deployment smoke only. This does not mark production ready.

## 1. Context

| Item | Value |
| --- | --- |
| Environment | VPS staging / internal demo |
| Date | 2026-07-05 |
| Admin | `https://kelola.kostation.web.id` |
| Penghuni | `https://app.kostation.web.id` |
| API | `https://api.kostation.web.id` |
| Release posture | Internal demo READY, production NOT READY |

Binding constraints:

- No product feature implementation in this task.
- No `.env` commit and no secrets printed.
- No Midtrans production key usage.
- No Midtrans real sandbox Snap/webhook validation in this task.
- Smart Lock remains simulated; live commands remain disabled.
- This evidence is for staging baseline only.

## 2. Service Baseline

`systemctl list-units --type=service --no-pager | grep -i granada`

| Service | Status |
| --- | --- |
| `granada-api.service` | loaded / active / running |
| `granada-admin.service` | loaded / active / running |
| `granada-penghuni.service` | loaded / active / running |

Systemd posture:

- API runs from `/var/www/granada-kost-platform/backend/api`, uses `EnvironmentFile=/var/www/granada-kost-platform/backend/api/.env`, and executes `/usr/bin/node dist/main.js`.
- Admin SSR runs from repo root on `127.0.0.1:3100`.
- Penghuni SSR runs from repo root on `127.0.0.1:3101`.

Port posture from `ss -ltnp`:

| Port | Bind | Purpose |
| --- | --- | --- |
| `80` | public | Nginx HTTP redirect |
| `443` | public | Nginx HTTPS |
| `3000` | `127.0.0.1` | API upstream |
| `3100` | `127.0.0.1` | Admin SSR upstream |
| `3101` | `127.0.0.1` | Penghuni SSR upstream |
| `5432` | `127.0.0.1` | PostgreSQL |
| `6379` | `127.0.0.1` | Redis |

## 3. Environment Hardening Checks

Only non-secret environment posture was checked. Secret-like values were redacted and are not recorded here.

Frontend:

| App | Key | Value |
| --- | --- | --- |
| Admin | `VITE_API_BASE_URL` | `https://api.kostation.web.id/api/v1` |
| Admin | `VITE_FEATURE_SMARTLOCK_MODE` | `simulated` |
| Penghuni | `VITE_API_BASE_URL` | `https://api.kostation.web.id/api/v1` |
| Penghuni | `VITE_FEATURE_SMARTLOCK_MODE` | `simulated` |

Backend:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `staging` |
| `PUBLIC_BASE_URL` | `https://api.kostation.web.id` |
| `CORS_ALLOWED_ORIGINS` | `https://kelola.kostation.web.id,https://app.kostation.web.id` |
| `PAYMENT_GATEWAY_ENABLED` | `false` |
| `PAYMENT_GATEWAY_PROVIDER` | `none` |
| `MIDTRANS_ENV` | `sandbox` |
| `SMART_LOCK_PROVIDER` | `simulated` |
| `SMART_LOCK_LIVE_ENABLED` | `false` |

Result:

- Smart Lock live execution is disabled.
- Frontend Smart Lock mode remains simulated.
- Payment gateway is disabled.
- Midtrans posture is sandbox-only.
- No production payment keys were used or validated.

## 4. Nginx and TLS

`sudo nginx -t`

Result:

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Certbot:

- Certificate name: `api.kostation.web.id`
- Domains: `api.kostation.web.id`, `app.kostation.web.id`, `kelola.kostation.web.id`
- Expiry: `2026-10-03 01:17:04+00:00`
- Auto-renew timer: active via `certbot.timer`

HTTP redirect smoke:

| URL | Result |
| --- | --- |
| `http://api.kostation.web.id/api/v1/health` | `301` to HTTPS |
| `http://kelola.kostation.web.id` | `301` to HTTPS |
| `http://app.kostation.web.id` | `301` to HTTPS |

## 5. Public Smoke Results

HTTPS:

| URL | Result |
| --- | --- |
| `https://api.kostation.web.id/api/v1/health` | `200 OK` |
| `https://kelola.kostation.web.id/login?next=%2F` | `200` |
| `https://app.kostation.web.id/login?next=%2F` | `200` |

CORS preflight:

| Origin | Endpoint | Result |
| --- | --- | --- |
| `https://kelola.kostation.web.id` | `OPTIONS /api/v1/auth/login` | `204 No Content` |
| `https://app.kostation.web.id` | `OPTIONS /api/v1/auth/login` | `204 No Content` |

Browser smoke:

- Admin login smoke: PASS, as confirmed manually by operator.
- Penghuni login smoke: PASS, as confirmed manually by operator.

## 6. Log Review

Recent warnings/errors after the baseline smoke window:

- `journalctl -u granada-admin.service -u granada-penghuni.service -u granada-api.service --since '2026-07-05 10:30:00' -p warning --no-pager`: no entries.
- Nginx error log after `2026/07/05 10:30:00`: no entries.

Historical note:

- Earlier frontend SSR asset serving produced `ERR_INVALID_STATE: ReadableStream is already closed` on Node 22 and Nginx `502`/upstream connection errors.
- The staging runner was adjusted to serve static assets as buffers, and subsequent route/asset smoke returned `200`.

## 7. Verdict

M15B-A VPS staging baseline smoke and environment hardening is PASS for internal demo staging.

This does not change release posture:

- Production remains NOT READY.
- Smart Lock live execution remains NO-GO.
- Midtrans real sandbox Snap/webhook remains not implemented/validated.
- Payment Gateway remains disabled on this staging baseline.

## 8. Follow-Ups

- Keep `.env` uncommitted and continue redacting secrets from evidence.
- For future update deploys: rebuild API/Admin/Penghuni, restart the three services, then rerun this smoke.
- Add Certbot contact email before production/go-live consideration.
- M15C-D remains the next payment gateway validation step if payment work resumes.

# Playwright Soll-Ist Matrix

Kontext: Abgleich gegen offizielle Playwright-Doku (`webServer`, `baseURL`, `reuseExistingServer`, `env`, `timeout`) mit Fokus auf stabile lokale/CI-Läufe.

## Matrix

| Mechanismus | Soll (Online-Doku) | Ist (Repo) | Delta / Risiko |
|---|---|---|---|
| `webServer` | Expliziter Startpfad; lokal/CI klar trennen | Aktiv nur bei `PLAYWRIGHT_USE_WEBSERVER=1` | OK |
| `use.baseURL` | Muss mit Ziel-Server-URL pro Modus konsistent sein | `PLAYWRIGHT_BASE_URL` default `3110` | OK |
| `reuseExistingServer` | Pro Modus konsistent (`!CI`-Muster möglich) | Gesteuert über `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` | OK, explizit statt implizit |
| Script-Modi | Ein Modus pro Command (kein Mix) | Lokale `test:e2e:local:*` erzwingen `REUSE=0` im Webserver-Mode auf `3110`; CI separat; `:reuse` ist nur Debug-Script | OK |
| Setup-Gate | Früher Abbruch mit klarer Ursache | `verify-playwright-env.mjs` prüft Browser/Port/Mode und bricht mit Code-Labels ab | OK |
| Build-vor-E2E | Build-Fehler dürfen nicht als E2E-Flake erscheinen | `test:e2e:local:*` und `test:e2e:ci` laufen über Build-Gate | OK |

## Top-Vertragsbrüche (historisch, jetzt adressiert)

1. Gemischte Modi (`reuse` vs `webServer`) in einem Lauf.
2. Uneindeutige URL-Quelle (`PLAYWRIGHT_DEFAULT_BASE_URL` plus `PLAYWRIGHT_BASE_URL`).
3. Build-/Typefehler wurden erst während E2E auffällig.
4. Fehlermeldungen ohne klare Klassifikation (`ENV_*` vs `APP_BUILD`).

## Zielvertrag

- App-Server: `3000`
- E2E-Server: `3110`
- Lokal: `test:e2e:local:*` (dedizierter E2E-Server)
- CI: `test:e2e:ci` (isolierter Serverstart)
- Reuse: nur bewusst via `test:e2e:local:workflow:reuse` (Debug, nicht Gate-Standard)


## Standard-vs-Debug Policy

- Standard (Gate): immer isolierter Webserver-Mode auf `http://127.0.0.1:3110` mit `PLAYWRIGHT_REUSE_EXISTING_SERVER=0`.
- Debug (manuell): Reuse-Mode ist nur für lokale Fehlersuche gedacht und kein Abnahme-Gate.
- Verbindlich: Port/Mode nicht mischen, keine impliziten Defaults außerhalb der Scripts.

## Command Matrix (verbindlich)

| Zweck | Kommando | Modus |
|---|---|---|
| Preflight lokal | `npm run -s test:e2e:doctor` | Isoliert, prüft Browser/Port/Mode |
| Lokaler Smoke-Gate | `npm run -s test:e2e:local:smoke` | Standard (isoliert, 3110) |
| Lokaler Workflow-Gate | `npm run -s test:e2e:local:workflow` | Standard (isoliert, 3110) |
| Lokaler Full-Gate | `npm run -s test:e2e:local:full` | Standard (isoliert, 3110) |
| CI-Gate | `npm run -s test:e2e:ci` | Standard (isoliert, 3110) |
| Debug-Reuse | `npm run -s test:e2e:local:workflow:reuse` | Debug-only (reuse) |

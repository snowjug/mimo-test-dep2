# Office → PDF converter (`converter/`)

**Responsibility:** convert Office documents (`.doc/.docx/.ppt/.pptx/.xls/.xlsx/.odt/.ods/.odp/.rtf/.txt`) to PDF with LibreOffice and report the page count. It is a private service on **Cloud Run** (`mimo-office-converter`); only the API calls it.

## Contents
| File | Purpose |
|---|---|
| `index.js` | Express app: `GET /` (health + LibreOffice info), `GET /health`, `POST /convert` |
| `Dockerfile` | `node:20-bookworm-slim` + LibreOffice Writer + fonts; listens on `PORT` (8080) |
| `package.json` | Dependencies: `express`, `firebase-admin`, `pdf-lib`; `npm start` |
| `test-local.js` | Manual comparison script (its sample-file path is stale — the fixtures moved to `scripts/testing/fixtures/`) |

## How it talks to other modules
`functions/src/services/converter.service.js` posts `{ storagePath | fileUrl, fileName, jobId }` to `POST /convert` with a Google identity token (Cloud Run IAM) and, if configured, the header `x-internal-secret`.
The converter downloads the file from Cloud Storage, converts it, uploads the PDF back and returns `{ pageCount, fileUrl, storagePath }`. Unsupported formats return `code: "UNSUPPORTED_FORMAT"`.

## Environment variables
| Variable | Meaning | Default |
|---|---|---|
| `PORT` | Listen port | `8080` |
| `STORAGE_BUCKET` | Bucket for input/output | the project's default bucket |
| `INTERNAL_CONVERTER_SECRET` | Shared secret checked on `/convert` (empty = no check) | empty |
| `CONVERSION_TIMEOUT_MS` | LibreOffice timeout | `60000` |

## Run locally (*unverified in the audit*)
Needs LibreOffice installed and Google credentials for Storage: `cd converter && npm install && npm start`, then `curl http://localhost:8080/health`. Or build the image: `docker build -t mimo-converter converter`.

## Deployment
GitHub Action `deploy-converter.yml` (on pushes to `main` touching `converter/**`, or manually): Cloud Build → Cloud Run (private, `--no-allow-unauthenticated`) → IAM binding for the Functions runtime → health check that expects **401/403** from the public URL (it must stay private).

## Testing and troubleshooting
* CI runs `node --check converter/index.js` (syntax only). There is no automated conversion test.
* Office uploads fail while PDFs/images still work → the converter is down, its IAM binding is missing, or `INTERNAL_CONVERTER_SECRET` differs between the API and the service.
* `403` from a browser is normal — the service is private.

Related: [`architecture.md` §3](../architecture.md), [`docs/deployment/CI_CD.md`](../docs/deployment/CI_CD.md).

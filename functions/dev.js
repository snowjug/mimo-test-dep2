// .env.local (not .env) on purpose: Firebase bundles a plain `.env` straight into every deployed
// function, but never `.env.local` -- that's what keeps these local-dev-only values off production.
require("dotenv").config({ path: require("path").resolve(__dirname, ".env.local") });

// A local server against production Firestore bills every dashboard poll and every hot reload; on 18 Oct 2026
// that was ~30M reads in one day. Use the emulator (`npm run dev:emulator`); reach production only on purpose.
if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.ALLOW_PROD !== "1") {
  console.error(
    "Refusing to start: no FIRESTORE_EMULATOR_HOST, so this would use the PRODUCTION database.\n" +
    "  Local data:      npm run dev:emulator\n" +
    "  Production (billed per read, read-only checks only): ALLOW_PROD=1 npm run dev"
  );
  process.exit(1);
}
if (process.env.ALLOW_PROD === "1") console.warn("⚠️  ALLOW_PROD=1: this local server reads and writes PRODUCTION Firestore.");

const app = require("./src/server");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Mimo Unified Functions Backend running at http://localhost:${PORT}`);
});

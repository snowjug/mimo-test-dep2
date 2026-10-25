// .env.local (not .env) on purpose: Firebase bundles a plain `.env` straight into every deployed
// function, but never `.env.local` -- that's what keeps these local-dev-only values off production.
require("dotenv").config({ path: require("path").resolve(__dirname, ".env.local") });
const app = require("./src/server");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Mimo Unified Functions Backend running at http://localhost:${PORT}`);
});

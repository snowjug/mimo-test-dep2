require("dotenv").config();
const app = require("./src/server");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Mimo Unified Functions Backend running at http://localhost:${PORT}`);
});

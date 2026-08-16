import { createApp } from "./app/createApp.js";

const port = Number(process.env.PORT ?? 8000);
const app = createApp();

app.listen(port, () => {
  console.log(`AWS Platform AIOps Agent listening on http://127.0.0.1:${port}`);
});

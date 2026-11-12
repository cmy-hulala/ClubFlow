import { app } from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`ClubFlow API listening on ${config.port} (${config.mode})`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use.`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

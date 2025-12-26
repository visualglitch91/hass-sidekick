import cors from "cors";
import express from "express";

export function createExpressApp({
  namespace,
  port,
}: {
  namespace: string;
  port: number;
}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/", (_, res) => {
    res.json({ message: `${namespace} is running` });
  });

  const server = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });

  return { ...app, server };
}

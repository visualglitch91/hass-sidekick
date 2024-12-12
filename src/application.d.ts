import { createSidekick } from "./index";

type Sidekick = ReturnType<typeof createSidekick>;

// Declare the global variable in NodeJS namespace
declare global {
  var sk: Sidekick;
}

export {};

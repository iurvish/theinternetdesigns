import { config } from "dotenv";
config({ path: ".env.local" });

import { asBoolean, asChoice, jevConfigured, jevEvaluate } from "../lib/jev/client";

async function main() {
  if (!jevConfigured()) {
    throw new Error("Set TYPESAFE_AI_API_KEY in .env.local first.");
  }

  const ping = await jevEvaluate({
    feature: "smoke",
    state: "dark fintech dashboard with a pricing table",
    questions: {
      dashboards: {
        type: "boolean",
        instructions: "Is the person looking for dashboard UI?",
      },
      category: {
        type: "choice",
        instructions: "Pick the best gallery category.",
        criteria: {
          dashboards: "Dashboards, admin, analytics",
          "landing-page": "Marketing landing pages",
          "logo-design": "Logos and marks",
          none: "None of these",
        },
      },
    },
  });
  if (!ping) throw new Error("Jev ping failed.");
  console.log(
    "ping dashboards",
    (asBoolean(ping.answers.dashboards)?.probability ?? 0).toFixed(3),
  );
  console.log("ping category", asChoice(ping.answers.category)?.choice);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

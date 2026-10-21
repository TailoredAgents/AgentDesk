import { config } from "dotenv";
import { validateDeploymentEnvironment } from "../src/lib/deployment-config";

config({ quiet: true });

const errors = validateDeploymentEnvironment(process.env);
if (errors.length) {
  console.error("AgentDesk production configuration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Correct these environment settings, then redeploy AgentDesk.");
  process.exitCode = 1;
} else {
  console.log("AgentDesk production configuration is valid.");
}

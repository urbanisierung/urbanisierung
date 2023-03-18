import { ReadmeGenerator } from "@magic-dev-tools/readme-utils";
import data from "./data.json";
import fs from "fs";

async function main() {
  const generator = new ReadmeGenerator(data);
  const readme = await generator.generate();
  fs.writeFileSync(`${__dirname}/../../README.md`, readme);
}

main();

#!/usr/bin/env node
import * as program from "commander";
import { parse as urlParse } from "url";
import { parse } from ".";

if (require.main === module) {
  program
    .version("0.0.1")
    .option("-v, --verbose", "Verbose mode")
    .option("-u, --url <path>", "URL to parse")
    .option("-p, --parselet <path>", "Path to parselet")
    .parse(process.argv);

  if (!program.parselet || !program.url) {
    // tslint:disable-next-line:no-console
    console.log("Please use --help");
    process.exit();
  }

  const parsedUrl = urlParse(program.url);
  // tslint:disable-next-line:no-var-requires
  parse(require(program.parselet), program.url, {
    context: `${parsedUrl.protocol}//${parsedUrl.host}`,
  })
  // tslint:disable-next-line:no-console
  .then((data) => console.log(JSON.stringify(data, null, "\t")))
  .catch(console.error);
}

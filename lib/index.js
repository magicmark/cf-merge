#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");
const yargs = require("yargs");

// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
const TOP_LEVEL_TOKENS = [
  "AWSTemplateFormatVersion",
  "Description",
  "Metadata",
  "Parameters",
  "Mappings",
  "Conditions",
  "Transform",
  "Resources",
  "Outputs"
];

const SECTION_REGEX = new RegExp(`^(${TOP_LEVEL_TOKENS.join("|")}):`, "gm");

function getMergedFile(filePath) {
  if (String(filePath).trim().length === 0) {
    throw new TypeError(`Expected a file path as the first argument`);
  }

  if (!existsSync(filePath)) {
    throw new Error(`Could not find '${filePath}' on disk`);
  }

  let file = readFileSync(filePath, "utf8");
  const includeMatches = [...file.matchAll(/# @include (.+?)$/gm)];

  includeMatches.forEach(match => {
    // e.g. ['# @include ./main.yml#Resources', './main.yml#Resources']
    const [includeStatement, resource] = match;
    // e.g. ['./main.yml', 'Resources']
    const [relativeImportFilePath, section] = resource.split("#");
    const resolvedImportFilePath = path.normalize(
      path.join(path.dirname(filePath), relativeImportFilePath)
    );
    const importedFile = readFileSync(resolvedImportFilePath, "utf8");
    const sections = importedFile.match(SECTION_REGEX);
    const nextSection = sections[sections.indexOf(`${section}:`) + 1] || null;
    const partial = importedFile.split(`${section}:`)[1].split(nextSection)[0];
    file = file.replace(
      includeStatement,
      `# imported from ${resolvedImportFilePath}\n${partial}`
    );
  });

  return file;
}

function merge(argv) {
    const { output, file: filePath } = argv;
    const merged = getMergedFile(filePath);

    if (output) {
        writeFileSync(output, merged);
    } else {
        console.log(merged);
    }
}

function main() {
  const argv = yargs
    .command("$0 <file>", "", _yargs => {
      _yargs
        .positional("file", {
          describe: "path to a CloudFormation template file",
          type: "string",
          normalize: true
        })
        .options({
          output: {
            alias: "o",
            normalize: true,
            type: "string",
            describe: "output file (will print to stdout if not specified)",
            demandOption: false
          }
        });
    })
    .help().argv;

  merge(argv);
}

if (!process.env.NODE_ENV) {
  main();
}

// For testing, and node api
module.exports = { getMergedFile };
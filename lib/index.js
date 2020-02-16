#!/usr/bin/env node
const path = require('path');
const yargs = require('yargs');
const isRelative = require('is-relative');

// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
const TOP_LEVEL_TOKENS = [
    //'AWSTemplateFormatVersion', TODO: Figure out if it makes sense to include this?
    'Description',
    'Metadata',
    'Parameters',
    'Mappings',
    'Conditions',
    'Transform',
    'Resources',
    'Outputs',
];

const SECTION_REGEX = new RegExp(`^(${TOP_LEVEL_TOKENS.join('|')}):`, 'gm');

class CFTemplate {
    constructor(body, filePath) {
        this.body = body;
        this.filePath = path.normalize(filePath);
    }

    static fromAbsoluteFilePath(filePath) {
        if (String(filePath).trim().length === 0) {
            throw new TypeError(`Expected a file path as the first argument`);
        }

        const normalizedFilePath = path.normalize(filePath);

        if (!CFTemplate.fs.existsSync(normalizedFilePath)) {
            throw new Error(`Could not find '${filePath}' on disk`);
        }

        const body = CFTemplate.fs.readFileSync(normalizedFilePath, 'utf8');
        return new CFTemplate(body, normalizedFilePath);
    }

    fromImportedFilePath(filePath) {
        const resolvedImportFilePath = isRelative(filePath)
            ? path.normalize(path.join(path.dirname(this.filePath), filePath))
            : path.normalize(filePath);

        if (!CFTemplate.fs.existsSync(resolvedImportFilePath)) {
            throw new Error(`Could not find '${filePath}' on disk`);
        }

        const body = CFTemplate.fs.readFileSync(resolvedImportFilePath, 'utf8');
        return new CFTemplate(body, resolvedImportFilePath);
    }

    get sections() {
        return this.body.match(SECTION_REGEX).map(section => section.replace(/:$/, ''));
    }

    get allImports() {
        return [...this.body.matchAll(/# @import (.+?)$/gm)];
    }

    get topLevelImports() {
        return this.allImports.filter(([, resource]) => {
            return !resource.includes('#');
        });
    }

    get inlineImports() {
        return this.allImports.filter(([, resource]) => {
            return resource.includes('#');
        });
    }

    addToSection(section, contents) {
        if (!this.sections.includes(section)) {
            this.body = `${this.body}\n${section}:`;
        }

        const sectionHeading = new RegExp(`^${section}:`, 'm');
        this.body = this.body.replace(sectionHeading, `${section}:${contents}`);
    }

    getSection(section) {
        if (!this.sections.includes(section)) {
            throw new Error(`${this.filePath} does not have section: ${section}`);
        }

        const nextSection = this.sections[this.sections.indexOf(section) + 1];
        const sectionHeading = new RegExp(`^${section}:`, 'm');
        return this.body.split(sectionHeading)[1].split(nextSection)[0];
    }
}

function getMergedFile(filePath) {
    // TODO: Import these at the top level once we figure out a better fs mocking solution
    // (If we import these at import-time, the mocks in the tests don't get change to be applied)
    CFTemplate.fs = require('fs');

    const template = CFTemplate.fromAbsoluteFilePath(filePath);

    template.topLevelImports.forEach(([, resource]) => {
        const importedTemplate = template.fromImportedFilePath(resource);
        importedTemplate.sections.forEach(importedSection => {
            template.addToSection(importedSection, importedTemplate.getSection(importedSection));
        });
    });

    template.inlineImports.forEach(([includeStatement, resource]) => {
        // e.g. ['./main.yml', 'Resources']
        const [relativeImportFilePath, section] = resource.split('#');
        const importedTemplate = template.fromImportedFilePath(relativeImportFilePath);
        template.body = template.body.replace(includeStatement, importedTemplate.getSection(section));
    });

    return template.body;
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
        .command('$0 <file>', '', _yargs => {
            _yargs
                .positional('file', {
                    describe: 'path to a CloudFormation template file',
                    type: 'string',
                    normalize: true,
                })
                .options({
                    output: {
                        alias: 'o',
                        normalize: true,
                        type: 'string',
                        describe: 'output file (will print to stdout if not specified)',
                        demandOption: false,
                    },
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

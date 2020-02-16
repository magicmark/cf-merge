#!/usr/bin/env node
const path = require('path');
const yargs = require('yargs');
const tempy = require('tempy');

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

        const normalizedFilePath = path.normalize(path.resolve(process.cwd(), filePath));

        if (!CFTemplate.fs.existsSync(normalizedFilePath)) {
            throw new Error(`Could not find '${normalizedFilePath}' on disk`);
        }

        const body = CFTemplate.fs.readFileSync(normalizedFilePath, 'utf8');
        return new CFTemplate(body, normalizedFilePath);
    }

    fromImportedFilePath(filePath) {
        const resolvedImportFilePath = path.isAbsolute(filePath)
            ? path.normalize(filePath)
            : path.normalize(path.join(path.dirname(this.filePath), filePath));

        if (!CFTemplate.fs.existsSync(resolvedImportFilePath)) {
            throw new Error(`Could not find '${resolvedImportFilePath}' on disk`);
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
    // TODO: Import these at the top level once we figure out a better fs mocking solution
    // (If we import these at import-time, the mocks in the tests don't get change to be applied)
    CFTemplate.fs = require('fs');

    const { tmpfile, path: outputFilePath, file: inputFilePath } = argv;
    const merged = getMergedFile(inputFilePath);

    if (outputFilePath) {
        CFTemplate.fs.writeFileSync(outputFilePath, merged);
        console.log(outputFilePath);
    } else if (tmpfile === true) {
        const tmpFile = tempy.file({ extension: 'yml' });
        CFTemplate.fs.writeFileSync(tmpFile, merged);
        console.log(tmpFile);
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
                })
                .options({
                    path: {
                        alias: 'p',
                        type: 'string',
                        describe: 'output file path (will print output to stdout if not specified)',
                        demandOption: false,
                        conflicts: ['tmpfile'],
                    },
                    tmpfile: {
                        alias: 't',
                        type: 'boolean',
                        describe: 'print template to a tmpfile. prints the filepath to stdout.',
                        demandOption: false,
                        default: false,
                        conflicts: ['path'],
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

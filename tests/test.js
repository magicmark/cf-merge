const test = require('ava');
const dedent = require('dedent');
const { Volume } = require('memfs');
const { patchFs } = require('fs-monkey');
const { getMergedFile } = require('../lib/index');

test('section imports', t => {
    const unpatch = patchFs(
        Volume.fromJSON({
            '/main.yml': dedent`
                AWSTemplateFormatVersion: 2010-09-09
                Parameters:
                    - foo
                Resources:
                    # @import ./bar.yml#Resources
            `,
            '/bar.yml': dedent`
                AWSTemplateFormatVersion: 2010-09-09
                Resources:
                    - bar
            `,
        }),
    );

    const mergedFile = getMergedFile('/main.yml');
    unpatch()
    t.snapshot(mergedFile)
});

test('top level imports', t => {
    const unpatch = patchFs(
        Volume.fromJSON({
            '/main.yml': dedent`
                AWSTemplateFormatVersion: 2010-09-09
                # @import ./bar.yml
                Parameters:
                    - foo
            `,
            '/bar.yml': dedent`
                AWSTemplateFormatVersion: 2010-09-09
                Parameters:
                    - bar
                Resources:
                    - baz
            `,
        }),
    );

    const mergedFile = getMergedFile('/main.yml');
    unpatch()
    t.snapshot(mergedFile)
});

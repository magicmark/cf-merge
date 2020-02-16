# 💥 cf-merge

cf-merge brings import syntax to [CloudFormation templates](https://aws.amazon.com/cloudformation/). Split up and modularize your stacks!

## Example

Use top-level imports to merge in other templates:

```yaml
# @import ./networking.yml
# @import ./security.yml

AWSTemplateFormatVersion: 2010-09-09
Parameters:
    - foo
Resources:
    - bar
```

Use inline imports to merge in sections of other templates:

```yaml
AWSTemplateFormatVersion: 2010-09-09
Parameters:
    - foo
    # @import ./ec2_instances.yml#Parameters
Resources:
    - bar
    # @import ./ec2_instances.yml#Resources
```

[See the tests](./tests/test.js) to see examples of this in action.

## Usage

cf-merge is distributed as a nodejs package. You can install it via npm or yarn:

```sh
yarn add @magicmark/cf-merge
```

You can then call `cf-merge` in your bash script when calling `aws cloudformation deploy`:

```sh
aws cloudformation deploy \
  --region $REGION \
  --profile $CLI_PROFILE \
  --stack-name $STACK_NAME \
  --template-file "$(yarn cf-merge main.yml --tmpfile)" \
```

## CLI API Docs

```
cf-merge <file>

Positionals:
  file  path to a CloudFormation template file                          [string]

Options:
  --version      Show version number                                   [boolean]
  --help         Show help                                             [boolean]
  --path, -p     output file path (will print output to stdout if not specified)
                                                                        [string]
  --tmpfile, -t  print template to a tmpfile. prints the filepath to stdout.
                                                      [boolean] [default: false]
```              
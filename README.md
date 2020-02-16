# 💥 cf-merge

cf-merge brings import syntax to [CloudFormation templates](https://aws.amazon.com/cloudformation/). Split up and modularize your stacks!

*Example*

```
AWSTemplateFormatVersion: 2010-09-09
Parameters:
    - foo
Resources:
    # @import ./bar.yml#Resources
```
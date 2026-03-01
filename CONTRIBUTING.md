# Contributing

This is one of the first Vite plugins I do, feel free to open issues and PR. 
The important thing is that everything is explained through the comment and correlated issue.

## Steps to get a review

- Open Issue: The first step is to open an issue and write the problem, or the feature that you want the project implement.
- Open a branch from develop: The name of the branch must be feature/[number of issue]
- Open a Pull Request: After made your changes open a PR from your working branch to 'develop'

## Making changes

When you make changes to plugin locally, you may want to build the js from the typescript file of the plugin.

Here the guidelines:

### Install

```terminal
npm install
```

### Testing

- Unit tests: `npm test`
- Integration fixtures: `npm run test:integration`

Integration fixtures are generated from template projects in `test/fixtures-templates` at test runtime, so they stay
lightweight in the repository while still exercising real Vite builds.

### Build plugin

```terminal
npm run build
```

### Running "real" projects

This plugin also implement a command that allow you to run real projects,
trying to replicate some use cases it covers:

- Run in dev: `npm run fixture:dev <fixture-name>`
- Run in preview: `npm run fixture:preview <fixture-name>`
- Run in prod: `npm run fixtures:prod <fixture-name>`

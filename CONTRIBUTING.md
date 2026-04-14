# Contributing

Thank you for your interest in contributing to `vite-plugin-css-injected-by-js`! Whether you are fixing a bug, proposing a new feature, or improving the documentation, your help is greatly appreciated.

To ensure a smooth review process, please make sure your changes are well-commented and tied to an existing issue.

## 🤝 Steps to get a review

1. **Open an Issue:** Before writing any code, please open an issue describing the bug you want to fix or the feature you want to implement. This ensures we agree on the approach before you spend time coding.
2. **Branch from `develop`:** Create a new working branch based on the `develop` branch. Please follow the naming convention: `feature/[issue-number]` (e.g., `feature/155`).
3. **Open a Pull Request:** Once your changes are ready, open a Pull Request from your working branch targeting the `develop` branch. Include a clear explanation of what you changed and reference the original issue.

---

## 🛠 Local Development

To make changes to the plugin locally, you will need to install the dependencies, build the TypeScript source into JavaScript, and run the test suite.

### 1. Install Dependencies

```terminal
npm install
```

### 2. Build the Plugin

Before running tests or testing your changes in the fixtures, you must build the plugin:

```terminal
npm run build
```

### 3. Testing

Please ensure all tests pass before submitting your PR. If you are adding a new feature, please include corresponding tests.

* **Unit tests:** `npm test`
* **Integration fixtures:** `npm run test:integration`

> **Note on Integration Tests:** Fixtures are generated dynamically from the template projects inside `test/fixtures-templates/` at runtime. This keeps the repository lightweight while still thoroughly exercising real Vite build pipelines.

### 4. The Playground (Running "Real" Projects)

The repository includes a command-line utility to test the plugin against real project environments, covering various practical use cases.

*(Remember to run `npm run build` before executing these commands so your latest changes are picked up!)*

* **Run in Dev Mode:** `npm run playground:dev <project-name>`
* **Run Production Build:** `npm run playground:prod <project-name>`
* **Preview Production Build:** `npm run playground:preview <project-name>`

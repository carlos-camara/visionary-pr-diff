# Contributing to Visionary PR Diff

Thank you for your interest in contributing to **Visionary PR Diff**! We welcome contributions that help improve this surgical visual regression engine.

---

## 🛠️ Technical Setup

To contribute to this project, you need to set up a local development environment:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/carlos-camara/visionary-pr-diff.git
   cd visionary-pr-diff
   ```
2. **Install Dependencies** (Optional for now, but recommended for linting):
   ```bash
   npm install
   ```
3. **Load Extension**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** in the top right.
   - Click **Load unpacked** and select the repository directory.

## 🔄 Contribution Workflow

We follow a standard professional contribution lifecycle:

1. **Branching Strategy**: Always create a feature branch from latest `main`.
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Linting & Style**: Ensure your code passes all linting checks before committing.
3. **Commit Convention**: Use [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat:`, `fix:`, `chore:`).
4. **Pull Request**:
   - Use the provided PR template.
   - Ensure CI checks (Hygiene, Lint) are green.
   - Our AI Summarizer will automatically provide a high-level overview of your changes.

## 🐛 Reporting & Suggestions

- **Bugs**: Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template.
- **Features**: Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template.

---
*Part of the Visionary Engineering Suite*

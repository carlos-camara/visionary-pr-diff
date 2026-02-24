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

We maintain enterprise-grade engineering standards:

1. **Branching Strategy**: Create feature branches (`feat/`, `fix/`, `chore/`) from `main`.
2. **Quality Guardrails**:
   - **Linting**: Code must pass ESLint flat config checks (enforced by Husky).
   - **Formatting**: Automated Prettier formatting on commit.
   - **Testing**: New logic must include [Jest](tests/diff-engine.test.js) unit tests.
3. **Commit Convention**: Follow [Conventional Commits](https://www.conventionalcommits.org/).
4. **Pull Request**:
   - Use the provided PR template.
   - CI pipelines (`tests.yml`, `lint.yml`) must be green for merge.
   - Documentation must be updated in `docs/` or `README.md` if applicable.

## 🤖 AI Assistance
Each Pull Request is automatically analyzed by our **Visionary AI Summarizer**, providing maintainers with a surgical overview of visual and logic modifications.

## 🐛 Reporting & Suggestions
- **Bugs**: Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template.
- **Features**: Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template.

---
*Precision by Design. Excellence by Choice.*

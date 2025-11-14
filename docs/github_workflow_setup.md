# GitHub Actions Workflow for Automated Testing

This document provides the GitHub Actions workflow to run automated tests on each commit to the main branch. The workflow includes:

- Python 3.13 setup
- Poetry dependency installation
- Pytest execution
- Ruff linting checks
- Docker image building

## Workflow File Content

Create a file at `.github/workflows/ci_tests.yml` with the following content:

```yaml
name: CI Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./bot
    strategy:
      matrix:
        python-version: [3.13]
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    
    - name: Install Poetry
      run: |
        curl -sSL https://install.python-poetry.org | python3 -
        export PATH="$HOME/.local/bin:$PATH"
    
    - name: Cache Poetry dependencies
      uses: actions/cache@v3
      with:
        path: ~/.cache/pypoetry
        key: ${{ runner.os }}-poetry-${{ hashFiles('**/poetry.lock') }}
        restore-keys: |
          ${{ runner.os }}-poetry-
    
    - name: Install dependencies
      run: |
        export PATH="$HOME/.local/bin:$PATH"
        poetry install
    
    - name: Run tests
      run: |
        export PATH="$HOME/.local/bin:$PATH"
        poetry run pytest -v
    
    - name: Run linting
      run: |
        export PATH="$HOME/.local/bin:$PATH"
        poetry run ruff check .

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v4
    
    - name: Build Docker image
      run: |
        docker build -t telewin-bot:latest ./bot/docker
```

## How to Activate This Workflow

GitHub has security restrictions that prevent pushing workflow files directly if the OAuth token doesn't have the `workflow` scope. To enable this CI workflow, please follow these steps:

1. Log into your GitHub account
2. Navigate to your repository
3. Go to the `.github/workflows/` directory (create it if it doesn't exist)
4. Create a new file named `ci_tests.yml`
5. Copy and paste the YAML content above
6. Commit the file

Once added, this workflow will automatically run tests on every push to the main branch.
<!--
@license
Copyright (c) 2025 tssuite

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
-->

# Ticket workflow

- [Checkout main](#checkout-main)
- [Set pull request title](#set-pull-request-title)
- [Create a feature branch](#create-a-feature-branch)
- [Update dependencies](#update-dependencies)
- [Develop \& debug](#develop--debug)
- [Commit](#commit)
- [Increase version](#increase-version)
- [Run tests and build](#run-tests-and-build)
- [Rebase main](#rebase-main)
- [Push changes](#push-changes)
- [Create a pull request](#create-a-pull-request)
- [Code review](#code-review)
- [Checkout main and delete feature branch](#checkout-main-and-delete-feature-branch)
- [Publish to NPM](#publish-to-npm)

## Checkout main

```bash
git checkout main
git fetch
git pull
```

## Set pull request title

Replace `Update dependencies` here and below
by your new pull request title.

## Create a feature branch

```bash
node dna/scripts/create-branch.js "Update dependencies"
```

## Update dependencies

```bash
pnpm update --latest
```

## Develop & debug

- [Debug & debug with Vscode](./debug-with-vscode.md)
- [Update Goldens](./update-goldens.md)
- [Rename classes](./rename-classes.md)
- [Super hero tricks](./super-hero.md)

## Commit

Use Vscode or another git client to commit your changes

If you have only one change, run

In Vscode, press

```bash
git add .
git commit -am"Update dependencies"
```

## Increase version

```bash
pnpm version patch --no-git-tag-version
git commit -am"Increase version"
```

## Run tests and build

```bash
pnpm run build
```

## Rebase main

```bash
git rebase main
```

## Push changes

```bash
node dna/scripts/push-branch.js
```

## Create a pull request

```bash
gh pr create --base main --title "Update dependencies" --body " "
```

## Code review

You need a code review? Read [code-review.md](./code-review.md).

If you don't require a code review, auto merge the branch

```bash
gh pr merge --auto --squash
node dna/scripts/wait-for-pr.js
```

## Checkout main and delete feature branch

```bash
node dna/scripts/delete-feature-branch.js
```

## Publish to NPM

```bash
node dna/scripts/publish-to-npm.js
```

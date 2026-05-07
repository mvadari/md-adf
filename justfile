set dotenv-load := false

default:
  just --list

validate-fixtures:
  npm run validate:fixtures

fixtures: validate-fixtures

test-js:
  npm run test:js

test-python:
  npm run test:python

lint-python:
  npm run lint:python

conformance:
  npm run conformance

test: validate-fixtures conformance

lint:
  npm run lint

format:
  npm run format

build:
  npm run build

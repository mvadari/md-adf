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

test: validate-fixtures test-js test-python

lint:
  npm run lint

format:
  npm run format

build:
  npm run build

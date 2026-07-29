# Fix Broken Test

A unit test is failing because the implementation has a bug. Fix the implementation
so that all tests pass.

## Requirements

- The test file is `test.js` — DO NOT modify this file
- The implementation file is `string_utils.js` — fix the bug here
- All tests in `test.js` must pass when run with `node test.js`

## Bug

The `capitalize` function has an off-by-one error that causes it to skip the
first letter of the second word when capitalizing multi-word strings.

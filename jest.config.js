module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 10000,
  clearMocks: true
};

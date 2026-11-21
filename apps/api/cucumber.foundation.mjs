export default {
  paths: ['../../specs/foundation/**/*.feature'],
  require: ['dist-bdd/bdd/**/*.js'],
  tags: process.env.CUCUMBER_TAGS ?? '@foundation',
  format: ['progress', 'json:coverage/cucumber-foundation.json'],
  publishQuiet: true,
};

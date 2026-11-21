export default {
  paths: ['../../specs/features/private-access.feature'],
  require: ['dist-bdd/bdd/**/*.js'],
  tags: process.env.CUCUMBER_AUTH_TAGS ?? '@P1-03',
  format: ['progress', 'json:coverage/cucumber-auth.json'],
  publishQuiet: true,
};

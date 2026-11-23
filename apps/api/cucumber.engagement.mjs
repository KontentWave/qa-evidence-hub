export default {
  paths: [
    '../../specs/features/engagement-context.feature',
    '../../specs/features/private-access.feature',
  ],
  require: ['dist-bdd/bdd/**/*.js'],
  tags: process.env.CUCUMBER_ENGAGEMENT_TAGS ?? '(@AC01 and @S1) or @P1-04',
  format: ['progress', 'json:coverage/cucumber-engagement.json'],
  publishQuiet: true,
};

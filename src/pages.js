'use strict';
/** Clean page URLs → HTML files. Shared by the Node server and the browser (Service Worker) build. */
module.exports = {
  '^/$': '/index.html',
  '^/learn/?$': '/learn.html',
  '^/connect/?$': '/connect.html',
  '^/login/?$': '/login.html',
  '^/campaigns/?$': '/campaigns.html',
  '^/campaigns/new/?$': '/new.html',
  '^/campaigns/cmp_[^/]+/?$': '/campaign.html',
};

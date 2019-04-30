'use strict';
const chalk = require('chalk');
const got = require('got');
const ora = require('ora');
const pLimit = require('p-limit');
const path = require('path');
const fs = require('../utils/fs');

const RESULT_TO_STATUS = {
  'success': 'SUCCESSFUL',
  'failed': 'FAILED',
  'error': 'FAILED'
};

function toStandardBuildConfig(build) {
  // If there is an error that causes the build to never run (i.e.
  // error parsing the dronefile) then the 'started' value is 0,
  // which causes all sorts of errors in the calculation of build
  // duration. In this case we use build.created instead
  let start_time = (build.started != "0" ? build.started : build.created);
  return {
    id: build.number,
    uuid: build.id,
    createdOn: start_time * 1000,
    duration: build.finished - start_time,
    result: RESULT_TO_STATUS[build.status] || 'STOPPED',
    refType: build.event,
    refName: build.source
  };
}

function getDroneUrl(user, repo) {
  let baseUrl = `https://cloud.drone.io`
  let repoSlug = `${user}/${repo}`;
  return `${baseUrl}/api/repos/${repoSlug}/builds`;
}

async function getTotalBuilds(user, repo) {
  let url = getDroneUrl(user, repo);
  let res = await got(url)
  let resJson = JSON.parse(res.body);
  return resJson.length;
}

async function fetchPipelines(
  buildsDir,
  { concurrency }
) {
  const [repo, user] = buildsDir.match(/(.*)\/(.*)\/(.*)\//).reverse();
  const limit = pLimit(concurrency); // limits the number of concurrent requests
  let totalBuilds = await getTotalBuilds(user, repo);
  let requestPromises = [];
  let spinner = ora().start('Starting download');
  let url = getDroneUrl(user, repo);

  let request = limit(async () => {
    let res = await got(url);
    let builds = JSON.parse(res.body);

    let fsPromises = builds.map(build => {
      let stdBuild = toStandardBuildConfig(build);
      let filePath = path.join(buildsDir, `${stdBuild.id}.json`);
      return fs.writeFile(filePath, JSON.stringify(stdBuild));
    });

    await Promise.all(fsPromises);
  });
  requestPromises.push(request);

  await Promise.all(requestPromises);

  spinner.succeed(
    chalk`Download completed. Total Builds: {green ${totalBuilds}}`
  );
}

exports.download = fetchPipelines;

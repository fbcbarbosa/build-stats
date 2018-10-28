//@flow
const chalk = require("chalk");
const pLimit = require("p-limit");
const got = require("got");
const ora = require("ora");
const path = require("path");
const fs = require("../utils/fs");
const {
  getBuildDir,
  getLastDownloadedBuildNumber
} = require("../utils/builds");
/**
 * URL for build -> curl --user <userName>:<password> https://<url-to-bamboo>/rest/api/latest/result/<ProjectKey-<BuildKey>-latest.json
 */

function toStandardBuildConfig(build) {
  return {
    id: build.buildNumber,
    uuid: build.id,
    createdOn: build.buildStartedTime,
    duration: build.buildDurationInSeconds,
    result: build.buildState && build.buildState.toUpperCase(),
    refType: "not available",
    refName: "master"
  };
}

const bambooApiUrl = (bambooUrl, projectKey_planKey) =>
  `https://${bambooUrl}/rest/api/latest/result/${projectKey_planKey}`;

async function getTotalBuilds(bambooUrl, projectKey_planKey) {
  const bambooBuildUrl = bambooApiUrl(bambooUrl, projectKey_planKey);
  const bambooLatestBuild = `${bambooBuildUrl}-latest.json`;
  let res = await got(bambooLatestBuild, {
    auth: "amathur:hithisisajay"
  });
  let resJson = JSON.parse(res.body);
  return resJson.buildNumber;
}

async function bambooBuilds(
  buildsDir,
  { auth, concurrency, downloadHook, since }
) {
  let spinner = ora().start("Initializing download");
  const [projectKey_planKey, bambooUrl] = buildsDir
    .match(/(.*)\/(.*)\/(.*)\//)
    .reverse();
  const pagelen = 25;
  const limit = pLimit(concurrency);
  let lastDownloaded = since;
  if (lastDownloaded == undefined) {
    lastDownloaded = await getLastDownloadedBuildNumber(buildsDir);
  }
  let startingBuild = lastDownloaded ? lastDownloaded + 1 : 1;
  let totalBuilds = await getTotalBuilds(bambooUrl, projectKey_planKey);
  let startPage = Math.floor(startingBuild / pagelen) + 1;
  let endPage = Math.floor(totalBuilds / pagelen) + 1;
  let downloaded = startingBuild - 1;
  spinner.text = "Starting download";

  let requestPromises = [];
  for (
    let buildNumber = startingBuild;
    buildNumber <= totalBuilds;
    buildNumber++
  ) {
    let url = `${bambooApiUrl(
      bambooUrl,
      projectKey_planKey
    )}-${buildNumber}.json`;
    requestPromises.push(
      limit(async () => {
        let res = await got(url, { auth });
        let resJson = JSON.parse(res.body);

        let build = toStandardBuildConfig(resJson);

        let filePath = path.join(buildsDir, `${build.id}.json`);

        return fs.writeFile(filePath, JSON.stringify(build));

        // let writeFilePromises = builds.map(build => {
        //   let date = new Date();
        //   let filePath = path.join(buildsDir, `${build.buildNumber}.json`);

        //   build = toStandardBuildConfig(build);

        //   return fs.writeFile(filePath, JSON.stringify(build));
        // });

        //await Promise.all(writeFilePromises);

        downloaded += 1;
        spinner.text = chalk`Downloaded data for {green ${downloaded}} builds of {green ${totalBuilds}} builds`;
        downloadHook && downloadHook(downloaded, totalBuilds);
      })
    );
  }

  await Promise.all(requestPromises);

  spinner.succeed(
    chalk`Download completed. Total Builds: {green ${totalBuilds}}`
  );
  console.log(totalBuilds);
  spinner.stop();
  return;
}

exports.download = bambooBuilds;

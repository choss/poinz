/**
 *  Build Script for Docker Image
 *
 *  1. clean-up output directories
 *  2. build poinz client (webpack)
 *  3. transpile backend sources
 *  4. copy client and backend to "deploy" folder
 *  5. build docker image (see Dockerfile)
 *
 * */
import path from 'path';
import {fileURLToPath} from 'url';
import util from 'util';
import {exec} from 'child_process';
import fs from 'fs-extra';
import {spawn} from 'cross-spawn';
import {deleteAsync} from 'del';

const execPromised = util.promisify(exec);

const HEROKU_DEPLOYMENT_TAG = 'registry.heroku.com/poinz/web';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDirPath = path.resolve(dirname, '../client');
const serverDirPath = path.resolve(dirname, '../server');

build()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    console.error(error.stack);
    process.exit(1);
  });

async function build() {
  // 1. clean-up output directories
  console.log('clean up deploy/ and client/dist/');
  await deleteAsync(['./deploy/', './client/dist/**/*']);

  // 2. build poinz client (webpack)
  console.log('installing npm dependencies for client...');
  await spawnAndPrint('npm', ['install'], {cwd: clientDirPath});

  console.log('building client with webpack...');
  await spawnAndPrint('npm', 'run build'.split(' '), {cwd: path.resolve(dirname, '../client')});

  console.log('copying built client to ./deploy/public');
  await fs.copy('./client/dist', './deploy/public/assets');
  await fs.copy('./client/index.html', './deploy/public/index.html');

  // 3. install dependencies for backend
  console.log('installing npm dependencies for server...');
  await spawnAndPrint('npm', ['install'], {cwd: serverDirPath});

  // 4. copy client and backend to "deploy" folder
  await fs.copy('./server/src', './deploy/src');
  await fs.copy('./server/package.json', './deploy/package.json');
  await fs.copy('./server/package-lock.json', './deploy/package-lock.json');

  //  5. build docker image (see Dockerfile)
  const gitInfo = await getGitInformation();
  await startBuildingDockerImage(gitInfo);

  console.log(
    'Done.\ndocker run  -e NODE_ENV=development -p 3000:3000 --name poinz_local -d xeronimus/poinz'
  );
}

/**
 * spawns a child process (nodejs' child_process.spawn)
 * and pipes stdout and stderr to the node process.
 *
 * @param command
 * @param args
 * @param options
 * @returns {Promise<T>} Returns a promise that will reject if childprocess does not exit with code 0.
 */
function spawnAndPrint(command, args, options) {
  const spawned = spawn(command, args, options);
  spawned.stdout.pipe(process.stdout);
  spawned.stderr.pipe(process.stderr);

  return new Promise((resolve, reject) =>
    spawned.on('exit', (code) =>
      code !== 0
        ? reject(
            new Error(
              ` Error in child process: ${code} - was trying to run "${command}"  with args "${args}" and options "${JSON.stringify(
                options
              )}"`
            )
          )
        : resolve()
    )
  );
}

function startBuildingDockerImage(gitInfo) {
  console.log(
    `building docker container for ${gitInfo.hash} on branch ${
      gitInfo.branch
    } (git-tags: ${gitInfo.tags.join(' ')})`
  );

  const user = process.env.DOCKER_USERNAME || 'choss';
  const userAndProject = `${user}/poinz-docker-custom`;
  const tags = [`${userAndProject}:latest`];
  gitInfo.tags.forEach((gitTag) => tags.push(`${userAndProject}:${gitTag}`));
  const cmdArgs = `build ${tags.map((tg) => '-t ' + tg).join(' ')} --network=host .`;

  console.log(` $ docker ${cmdArgs}`); // will be something like : docker build -t xeronimus/poinz:latest -t registry.heroku.com/poinz/web .

  return spawnAndPrint('docker', cmdArgs.split(' '), {cwd: path.resolve(dirname, '..')});
}

function getGitInformation() {
  return Promise.all([
    execPromised('git rev-parse --abbrev-ref HEAD', {cwd: dirname}), // This will return `HEAD` if in detached mode
    execPromised('git rev-parse --short HEAD', {cwd: dirname}),
    execPromised('git tag --points-at HEAD', {cwd: dirname})
  ]).then(([abbrev, short, tags]) => ({
    branch: process.env.TRAVIS_BRANCH || abbrev.stdout.split('\n').join(''),
    hash: short.stdout.split('\n').join(''),
    tags: tags.stdout.split('\n').filter((n) => n)
  }));
}

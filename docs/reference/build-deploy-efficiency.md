# Build & Deploy Efficiency — Reference

Detailed investigation of how production PaaS platforms efficiently build and deploy Docker workloads. Sourced directly from GitHub `main`/`canary` branches via raw `WebFetch` on 2026-08-30.

---

## Table of Contents

1. [Platform A — Helper Container & Job Model](#1-platform-a--helper-container--job-model)
2. [Platform A — Build Commands](#2-platform-a--build-commands)
3. [Platform A — Cache & Secrets](#3-platform-a--cache--secrets)
4. [Platform A — Rolling Updates & Healthchecks](#4-platform-a--rolling-updates--healthchecks)
5. [Platform B — Builder Registry](#5-platform-b--builder-registry)
6. [Platform B — Docker & Other Builders](#6-platform-b--docker--other-builders)
7. [Platform B — Deploy & Queue](#7-platform-b--deploy--queue)
8. [Cross-Cutting Comparison](#8-cross-cutting-comparison)
9. [Patterns Applied to NanoFly](#9-patterns-applied-to-nanofly)
10. [Raw Source URLs](#10-raw-source-urls)

---

## 1. Platform A — Helper Container & Job Model

**Source:** `app/Jobs/ApplicationDeploymentJob.php` (4451 lines), `docker/coolify-helper/Dockerfile` (58 lines)

### Job Definition

```php
class ApplicationDeploymentJob implements ShouldBeEncrypted, ShouldQueue {
    public $tries = 1;
    public $timeout = 3600; // overwritten to server.settings.dynamic_timeout
    private const BUILD_SCRIPT_PATH = '/artifacts/build.sh';
    private const BUILD_TIME_ENV_PATH = '/artifacts/build-time.env';
    private const NIXPACKS_PLAN_PATH = '/artifacts/thegameplan.json';
    private bool $dockerBuildkitSupported = false;
    private bool $dockerBuildxAvailable = false;
    private bool $dockerSecretsSupported = false;
}
```

### Helper Image

`docker/coolify-helper/Dockerfile`:

```dockerfile
ARG BASE_IMAGE=alpine:3.21
ARG DOCKER_VERSION=29.7.2
ARG DOCKER_COMPOSE_VERSION=5.5.0
ARG DOCKER_BUILDX_VERSION=0.36.1
ARG PACK_VERSION=0.38.2
ARG NIXPACKS_VERSION=1.41.0
ARG RAILPACK_VERSION=0.23.0
ARG MISE_VERSION=2026.3.17
ARG MINIO_VERSION=RELEASE.2025-08-13T08-35-41Z
FROM minio/mc:${MINIO_VERSION} AS minio-client
FROM ${BASE_IMAGE} AS base
ARG TARGETPLATFORM
WORKDIR /artifacts
RUN apk upgrade --no-cache && apk add --no-cache bash curl git git-lfs openssh-client pigz tar tini
RUN mkdir -p ~/.docker/cli-plugins
# ... per-arch binary installs for buildx, compose, docker, pack, nixpacks, railpack ...
COPY --from=minio-client /usr/bin/mc /usr/bin/mc
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["tail", "-f", "/dev/null"]
```

### Why Helper Container

```php
// prepare_builder_image() — key isolation
$helperImage = coolifyHelperImage().":".getHelperVersion();
$buildxMetadataVolume = isDev() && $server->isLocalhost()
    ? '-v coolify-buildx:/root/.docker/buildx'
    : "-v {$this->serverUserHomeDir}/.docker/buildx:/root/.docker/buildx";

$runCommand = "docker run -d --network {$safeNetwork} --name {$this->deployment_uuid} {$env_flags} --rm "
    . "-v {$this->serverUserHomeDir}/.docker/config.json:/root/.docker/config.json:ro "
    . "{$buildxMetadataVolume} "
    . "-v /var/run/docker.sock:/var/run/docker.sock {$helperImage}";
```

- **Isolation:** `git clone`, `nixpacks plan`, `build.sh`, `/artifacts/*` all inside helper at `WORKDIR /artifacts`. Host disk stays clean.
- **Persisted cache:** Host `~/.docker/buildx` → helper `/root/.docker/buildx` survives deployments.
- **Registry auth:** Host `~/.docker/config.json` mounted read-only for private registry pushes.
- **Network:** Joins destination network so `--add-host` can resolve container IPs.
- **Lifecycle:** `finally` block always `graceful_shutdown_container()`, helper `--rm` auto-removes.

### Workdirs

```php
$this->basedir = $this->application->generateBaseDir($this->deployment_uuid); // /artifacts/<uuid>
$this->workdir = "{$this->basedir}".rtrim($baseDir, '/'); // + base_directory
$this->configuration_dir = application_configuration_dir()."/{$this->application->uuid}"; // /data/coolify/applications/<uuid>
```

### BuildKit Detection

```php
private function detectBuildKitCapabilities(): void
{
    $dockerVersion = instant_remote_process(["docker version --format '{{.Server.Version}}'"], $serverToCheck);
    // <18.09 => no BuildKit

    $buildxAvailable = instant_remote_process(["docker buildx version >/dev/null 2>&1 && echo 'available' || echo 'not-available'"], $serverToCheck);
    if (trim($buildxAvailable) === 'available') {
        $this->dockerBuildkitSupported = true;
        $this->dockerBuildxAvailable = true;
    } else {
        $buildkitTest = instant_remote_process(["DOCKER_BUILDKIT=1 docker build --help 2>&1 | grep -q '\\-\\-progress' && echo 'supported' || echo 'not-supported'"], $serverToCheck);
    }
    if ($this->application->settings->use_build_secrets && $this->dockerBuildkitSupported) {
        $secretsTest = instant_remote_process(["docker build --help 2>&1 | grep -q 'secret' && echo 'supported' || echo 'not-supported'"], $serverToCheck);
        $this->dockerSecretsSupported = trim($secretsTest)==='supported';
    }
}
```

Three flags gate every build variant: `dockerBuildkitSupported`, `dockerBuildxAvailable`, `dockerSecretsSupported`.

---

## 2. Platform A — Build Commands

All commands base64-encoded to `/artifacts/build.sh` then `bash /artifacts/build.sh` (avoids shell escaping, enables log capture).

### Wrapper for Build-Time Env

```php
private function wrap_build_command_with_env_export(string $build_command): string
{
    return "cd {$this->workdir} && set -a && source ".self::BUILD_TIME_ENV_PATH." && set +a && {$build_command}";
}
// → cd /artifacts/<uuid> && set -a && source /artifacts/build-time.env && set +a && DOCKER_BUILDKIT=1 docker build ...
```

`build-time.env` lives at `/artifacts/build-time.env` **outside** `workdir` — `COPY . .` never bakes secrets.

### Command Matrix

| Path | Condition | Pattern |
|---|---|---|
| **Dockerfile** | force + secrets | `DOCKER_BUILDKIT=1 docker build --no-cache --pull {$buildTarget} {$addHosts} --network host -f {$workdir}{$dockerfile_location} --secret ... --progress plain -t {$image} {$workdir}` |
| | BuildKit no secrets | `DOCKER_BUILDKIT=1 docker build --no-cache {$buildTarget} {$addHosts} --network host -f ... --progress plain -t ... {$build_args} {$workdir}` |
| | legacy | `docker build --no-cache {$buildTarget} {$addHosts} --network host -f ... -t ... {$build_args} {$workdir}` |
| **Nixpacks** | cached | `DOCKER_BUILDKIT=1 docker build {$addHosts} --network host -f {$workdir}/.nixpacks/Dockerfile --progress plain -t {$build_image} {$workdir}` |
| **Compose** | | `DOCKER_BUILDKIT=1 docker compose --env-file /artifacts/build-time.env --project-name {$uuid} --project-directory {$workdir} -f {$workdir}{$compose_loc} build --pull [--no-cache]` |
| **Railpack** | | `DOCKER_CONFIG=/root/.docker docker buildx build --builder coolify-railpack {$addHosts} --network host --build-arg BUILDKIT_SYNTAX="ghcr.io/railwayapp/railpack-frontend:v<ver>" {$cacheArgs} {$secretFlags} -f /artifacts/railpack-plan.json --progress plain --load -t {$image} {$workdir}` + `docker buildx create --name coolify-railpack --driver docker-container` |

Consistent flags:

- `DOCKER_BUILDKIT=1` only when supported; legacy omits.
- `--progress plain` only with BuildKit.
- `--network host` always.
- `--add-host container:IP` from `docker network inspect` JSON (excludes `coolify-proxy` and ephemeral containers).
- `--pull` for production Dockerfile builds.
- `--target` when `dockerfile_target_build` set.

Only **Railpack** uses `buildx`; others use `docker build` (avoids builder overhead; Railpack requires `mergeop`).

### Git Clone

```bash
git -c 'url.https://x-access-token:<REDACTED>@github.com/.insteadOf=https://github.com/' \
    -c http.version=HTTP/1.1 clone --depth=1 --recurse-submodules --shallow-submodules \
    -b 'main' 'https://<token>@github.com/org/repo.git' '/artifacts/<uuid>' \
  && cd '/artifacts/<uuid>' \
  && git fetch --depth=1 origin '<commit>' \
  && git -c advice.detachedHead=false checkout '<commit>'
```

- Shallow `--depth=1`, submodule depth 1, `http.version=HTTP/1.1`, token via `insteadOf` (avoids leaking in remote URL).

---

## 3. Platform A — Cache & Secrets

### Cache

- `settings->disable_build_cache` forces `force_rebuild` → `--no-cache`.
- **Nixpacks:** `--cache-key '{$uuid}'` (deterministic app UUID) vs `--no-cache`.
- **Railpack:** `--build-arg cache-key='{$uuid}'` vs `--no-cache` + `--build-arg secrets-hash=<hmac>`.
- **Dockerfile:** Simple `--no-cache` toggle; secrets path adds `secrets-hash` via mount invalidation.
- **No `--mount=type=cache`** — layer cache + explicit keys only.
- **Compose:** `build --pull [--no-cache]`.
- **Secrets hash:** `hash_hmac('sha256', sorted("key=value|..."), APP_KEY)` — deterministic, preserves cache until vars change.

### Build Args vs Secrets

```php
// Traditional
$build_args = collect([...buildtime envs])
    ->map(fn($v,$k) => generateDockerBuildArgs($k,$v)) // ARG KEY or ARG KEY=value (multiline)
    ->merge(collect($coolify_vars)->map(fn($v,$k) => "ARG '$k'"))
    ->implode(' ');

// Secrets
$build_secrets = collect([...vars])
    ->map(fn($v,$k) => "--secret id={$k},env={$k}")
    ->implode(' ') . ' --secret id=COOLIFY_BUILD_SECRETS_HASH,env=COOLIFY_BUILD_SECRETS_HASH';
$build_args = ''; // no build-args when secrets enabled
```

- `SOURCE_COMMIT` excluded from build-time by default (cache buster opt-in).
- `COOLIFY_CONTAINER_NAME` excluded from build-time (changes every deploy).

### Dockerfile Injection

```php
// add_build_env_variables_to_dockerfile()
$fromLines = findFromInstructionLines($dockerfile); // regex /^FROM\s+/i
foreach (array_reverse($fromLines) as $fromLineIndex) {
    foreach ($argsToInsert->reverse() as $arg) {
        $dockerfile->splice($fromLineIndex + 1, 0, [$arg]);
    }
}
$dockerfile->push("ARG COOLIFY_BUILD_SECRETS_HASH=<hmac>"); // cache invalidation

// modify_dockerfile_for_secrets()
if (!str_contains($content, "# syntax=docker/dockerfile:1")) $content = "# syntax=docker/dockerfile:1\n" . $content;
$mounts = $vars->map(fn($v,$k) => "--mount=type=secret,id={$k},env={$k}")->implode(' ');
$line = "RUN {$mounts} {$originalCommand}"; // every RUN without existing mount
```

Compose variant iterates per-service, handles string vs array `build:` and `context/dockerfile`, deduplicates existing ARGs per stage.

### .dockerignore & Context

- **No explicit generation** — relies on Docker's native `.dockerignore` at `{$workdir}/.dockerignore`.
- **Context isolation:** `/artifacts/build-time.env`, `/artifacts/thegameplan.json`, `/artifacts/railpack-plan.json` stored outside `workdir`.
- **`cleanup_git()`:** `rm -fr {$basedir}/.git` before build.

---

## 4. Platform A — Rolling Updates & Healthchecks

### Rolling Update

```php
private function rolling_update(): void
{
    if (isSwarm()) {
        // Swarm: docker stack deploy --detach --with-registry-auth
    } else if (needsRecreate()) {
        // ports mapped, consistent name, custom IP, PR
        $this->stop_running_container(force:true);
        $this->start_by_compose_file();
    } else {
        $this->start_by_compose_file(); // new container with timestamp suffix
        $this->health_check();           // gate
        $this->stop_running_container(); // only if healthy, else rollback
    }
}
```

`start_by_compose_file()`:

```php
touch .env;
if (dockerimage) { docker compose --project-directory {$workdir} pull; {$coolify_vars} docker compose up --build -d; }
else if (use_build_server) { {$coolify_vars} docker compose --project-directory {$configuration_dir} -f ... up --pull always --build -d; }
else { docker compose --project-directory {$workdir} up --build -d; }
```

Container names: `uuid-Hisu` timestamp unless consistent name enabled.

### Healthcheck

```php
// generate_healthcheck_commands()
healthcheck: {
    test: curl -s -X GET -f http://localhost:<port><path> > /dev/null || wget -q -O- ... || exit 1,
    interval: health_check_interval,
    timeout: health_check_timeout,
    retries: health_check_retries,
    start_period: health_check_start_period,
}
// health_check()
sleep(start_period);
for ($i=0; $i<retries; $i++) {
    $status = docker inspect --format='{{json .State.Health.Status}}' $container;
    $logs = docker inspect --format='{{json .State.Health.Log}}' $container;
    sleep(interval);
}
```

### Timeouts & Cleanup

- Job timeout: `dynamic_timeout` default 3600s.
- SSH: `ConnectTimeout=30`, `Process::timeout(ssh.command_timeout)->idleTimeout(3600)`.
- Stop grace: `deploymentStopGracePeriodSeconds` → `docker stop --timeout` (Docker 28+) vs `--time` legacy.
- Remove: `timeout -k 10s 60s docker rm -f <container>`; on exit 124 prints `__COOLIFY_CONTAINER_REMOVE_TIMEOUT__` and dispatches `RemoveContainerJob` delayed 5 min.

### Log Streaming & Failure

```php
Process::start($remote_command, function($type,$output){
    $entry = ['command'=>$cmd,'output'=>redact($output),'type'=>$type,'timestamp'=>now(),'hidden'=>$hidden,'batch'=>$batch];
    $queue->logs = json_encode([...previous, $entry]);
    $queue->save();
});
```

- `hidden:true` stored but not shown unless debug.
- `finally` always updates `finished_at`, writes deployment configs, shuts down helper.
- `failed(Throwable)` logs stack trace, removes new container if unhealthy.

---

## 5. Platform B — Builder Registry

**Branch:** `canary` (37k stars), `main` 404s.

### Dispatcher

```ts
export const getBuildCommand = async (rawApplication: ApplicationNested) => {
    const application = await withResolvedVaultRefs(rawApplication);
    let command = "";
    if (application.sourceType !== "docker") {
        switch (application.buildType) {
            case "nixpacks": command = getNixpacksCommand(application); break;
            case "heroku_buildpacks": command = getHerokuCommand(application); break;
            case "paketo_buildpacks": command = getPaketoCommand(application); break;
            case "static": command = getStaticCommand(application); break;
            case "dockerfile": command = getDockerCommand(application); break;
            case "railpack": command = getRailpackCommand(application); break;
        }
    }
    if (application.registry || application.buildRegistry || application.rollbackRegistry) {
        command += await uploadImageRemoteCommand(application);
    }
    return command;
};
// deploy: mechanizeDockerContainer() → dockerode CreateServiceOptions → service.update({ForceUpdate:+1}) or createService
```

Deploy is **Swarm only**: `UpdateConfig:{Parallelism:1, Order:"start-first", FailureAction:"rollback"}`.

---

## 6. Platform B — Docker & Other Builders

### Docker Builder

```ts
export const getDockerCommand = (application: ApplicationNested) => {
    const dockerFilePath = getBuildAppDirectory(application);
    const dockerContextPath = getDockerContextPath(application) || defaultContextPath;
    const commandArgs = ["build", "-t", image, "-f", dockerFilePath, "."];
    if (dockerBuildStage) commandArgs.push("--target", dockerBuildStage);
    if (cleanCache) commandArgs.push("--no-cache");
    const args = prepareEnvironmentVariablesForShell(buildArgs, project.env, env.env);
    for (const arg of args) commandArgs.push("--build-arg", arg);
    const secrets = getEnvironmentVariablesObject(buildSecrets, project.env, env.env);
    let command = "";
    if (!publishDirectory && createEnvFile) command += createEnvFileCommand(dockerFilePath, env, project.env, env.env);
    for (const key in secrets) commandArgs.push("--secret", `type=env,id=${key}`);
    command += `
echo ${quote([`Building ${appName}`])} ;
cd ${quote([dockerContextPath])} || { echo ${quote([`❌ The path ${dockerContextPath} does not exist`])} ; exit 1; }
${joinedSecrets} docker ${commandArgs.join(" ")} || { echo "❌ Docker build failed" ; exit 1; }
echo "✅ Docker build completed." ;
`;
    return command;
};
```

- Cache: only `--no-cache` on `cleanCache`; no `buildx`, no `--cache-from`.
- Secrets: `KEY='value' docker build ... --secret type=env,id=KEY` (BuildKit env).
- Context: `dockerContextPath` fallback to Dockerfile parent dir.
- `.dockerignore`: untouched (Docker native); only `static.ts` generates one.

### Nixpacks

```ts
const args = ["build", buildAppDirectory, "--name", appName];
if (cleanCache) args.push("--no-cache");
for (const env of envVariables) args.push("--env", env);
if (publishDirectory) args.push("--no-error-without-start");
// static extraction: docker create --name <tmp> <image>; docker cp /app/<publishDir> <local>; docker rm <tmp>; getStaticCommand()
```

### Heroku / Paketo

```ts
// heroku
const args = ["build", appName, "--path", buildAppDirectory, "--builder", `heroku/builder:${version||"24"}`];
if (cleanCache) args.push("--clear-cache");
// paketo
const args = ["build", appName, "--path", buildAppDirectory, "--builder", "paketobuildpacks/builder-jammy-full"];
if (cleanCache) args.push("--clear-cache");
```

Tool: `pack` (Cloud Native Buildpacks).

### Railpack (most sophisticated)

```ts
const secretsHash = calculateSecretsHash(envVariables); // sha256 sorted
const cacheKey = cleanCache ? nanoid(10) : undefined;
const builderName = `railpack-${appName}-${nanoid(6)}`;
const buildArgs = ["buildx", "build", "--builder", builderName, "--build-arg", `secrets-hash=${secretsHash}`, ...(cacheKey ? ["--build-arg", `cache-key=${cacheKey}`] : []), "--build-arg", `BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v${version}`, "-f", `${buildAppDirectory}/railpack-plan.json`, "--output", `type=docker,name=${appName}`];
for (const pair of rawEnvVariables) buildArgs.push("--secret", `id=${key},env=${key}`);
bashCommand = `
$SUDO_CMD bash -c "$(curl -fsSL https://railpack.com/install.sh)"
docker buildx create --name ${builderName} --driver docker-container || true
railpack ${prepareArgs.join(" ")} || { docker buildx rm ${builderName} || true; exit 1; }
${exportEnvs.join("\n")}
docker ${buildArgs.join(" ")} || { docker buildx rm ${builderName} || true; exit 1; }
docker buildx rm ${builderName} || true
`;
```

- Per-build unique `builderName` + `docker-container` driver avoids collisions.
- `secrets-hash` invalidates only when env changes; `cache-key=nanoid` on `cleanCache`.

### Static

```ts
command += getCreateFileCommand(buildAppDirectory, ".dockerignore", [".git",".env","Dockerfile",".dockerignore"].join("\n"));
command += getCreateFileCommand(buildAppDirectory, "Dockerfile", ["FROM nginx:alpine","WORKDIR /usr/share/nginx/html/", isStaticSpa?"COPY nginx.conf /etc/nginx/nginx.conf":"", `COPY ${publishDirectory || "."} .`, 'CMD ["nginx", "-g", "daemon off;"]'].join("\n"));
command += getDockerCommand({...application, buildType:"dockerfile", dockerfile:"Dockerfile"});
```

Only place where `.dockerignore` is generated.

### Compose

```ts
command = `compose -p ${quote([appName])} ${projectDirectoryFlag}-f ${quote([path])} up -d --build --remove-orphans`;
// or stack: stack deploy -c ${quote([path])} ${quote([appName])} --prune --with-registry-auth
```

Sanitized via `UNSAFE_COMPOSE_COMMAND = /[;|`$(){}<>\n\\]/`.

---

## 7. Platform B — Deploy & Queue

### Orchestration

```ts
export const deployApplication = async ({applicationId}) => {
  const deployment = await createDeployment({applicationId});
  try {
    let command = "set -e;";
    if (sourceType==="github") command+=await cloneGithubRepository(applicationEntity)
    // gitlab, gitea, docker, bitbucket similarly
    if (sourceType!=="docker") command+=await generateApplyPatchesCommand(...)
    command+=await getBuildCommand(application);
    const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
    if (serverId) await execAsyncRemote(serverId, commandWithLog)
    else await execAsync(commandWithLog)
    await mechanizeDockerContainer(application);
    await updateDeploymentStatus(deployment.deploymentId, "done")
  } catch (error) {
    // base64 encode error → append to logPath, status error, notifications
  }
};
```

- Single `set -e;` chain: `git clone --branch <b> --depth 1 --progress` → `build` → `registry push` → one SSH `exec`.
- `buildServerId || serverId` split — build can be remote from deploy node.
- **No timeout** — `ssh2.timeout=99999` (~27h); no `stalledInterval`.
- Logs: file redirection `>> logPath 2>&1`, UI polls; `onData` callback exists but not used for builds.

### Queue & Concurrency

```ts
export const resolveBuildsConcurrency = async (partition) => normalize((await getWebServerSettings()).buildsConcurrency??1);
export const getPartition = (data)=> data.serverId ?? LOCAL_PARTITION
export const getGroup = (data)=> data.applicationType==="compose" ? `compose:${composeId}` : `application:${applicationId}`
// drainPartition: while active.length < concurrency → first waiting job whose group not in activeGroups → active.push → runJob
export const killDockerBuild = async (type, serverId) => {
  const cmd = type==="application" ? `pkill -2 -f "docker build"` : `pkill -2 -f "docker compose"`;
  if (serverId) await execAsyncRemote(serverId, cmd); else await execAsync(cmd);
};
```

- Per-server partition FIFO + per-group (per-app) serialization; default concurrency 1.
- In-memory queue, lost on restart → stuck `running` after reboot.
- `getCreateFileCommand`: `mkdir -p dir; echo "base64" | base64 -d > path` (avoids shell injection).

### Cleanup & Registry

```ts
const cleanupCommands = {
  containers: "docker container prune --force",
  images: "docker image prune --all --force",
  builders: "docker builder prune --all --force",
  system: "docker system prune --all --force",
};
export const dockerSafeExec = (exec) => `
CHECK_INTERVAL=10; MAX_WAIT=300; WAITED=0;
while true; do
  PROCESSES=$(ps -eo args | awk '$1 ~ /(^|\\/)docker$/')
  if [ -z "$PROCESSES" ]; then break; fi
  sleep $CHECK_INTERVAL; WAITED=$((WAITED+CHECK_INTERVAL));
done
${exec}
`;
// Registry: safeDockerLoginCommand → printf %s 'pass' | docker login ... --password-stdin → docker tag → docker push
// Git clone: git clone --branch ${branch} --depth 1 --recurse-submodules ${cloneUrl} --progress
```

No per-build prune; user-triggered dashboard; `dockerSafeExec` busy-waits up to 300s.

---

## 8. Cross-Cutting Comparison

| Aspect | Platform A | Platform B | NanoFly (v0.3.45) |
|---|---|---|---|
| **Isolation** | Helper container Alpine + `docker.sock` + `~/.docker/buildx` cache | Single `set -e;` chain, one SSH exec, file `>> logPath` | Host `docker build` directly, `DOCKER_BUILDKIT=1` |
| **Build tool** | `docker build` (all) + `buildx` (Railpack only) | `docker build` (Dockerfile) / `nixpacks` / `pack` / `railpack buildx` | `docker build` + `nixpacks build` |
| **Cache** | `cache-key` UUID, `secrets-hash` HMAC, no `mount=cache`, `rm -fr .git` | Only `--no-cache`/`--clear-cache`, `secrets-hash` (Railpack), `.git` not removed | `.git` removal, `.dockerignore` 70+ merged, `--mount=type=cache` for npm/pip/go, `--pull` |
| **.dockerignore** | Native only (no generation) | Only static (`".git\n.env\nDockerfile\n.dockerignore"`) | Merge 70+ entries if missing |
| **Build args** | `ARG` after every `FROM` + `ARG HASH`, secrets via `--mount=type=secret` | `--build-arg` quoted via `shell-quote`, `--secret type=env` | `--build-arg` + `ARG` after every `FROM` (injected) |
| **Secrets** | `--secret id=,env=` + mount injection, outside context | `--secret type=env,id=KEY` + env prefix | Future: `--secret` (not yet) |
| **Network** | `--network host` always | Not set | `--network=host` added v0.3.45 |
| **Context** | `/artifacts/build-time.env` outside workdir, base64 `build.sh` | `echo base64 | base64 -d > .env` | Context size log, baseDirectory support |
| **Deploy** | Swarm `stack deploy` or `compose up --build -d` + rolling `start new → healthcheck → stop old` | Swarm `service.update` with `ForceUpdate`, `start-first`, `rollback` | `docker run` with Traefik labels, `--restart=unless-stopped` |
| **Timeout** | Job 3600s dynamic, SSH `ConnectTimeout=30`, idle 3600s, stop grace configurable | `timeout=99999` (no per-build), no stalled handling | `context.WithTimeout` + `exec.CommandContext` |
| **Logs** | `Process::start` callback per chunk → `logs` JSON column | File `>> logPath` + poll `cat`/`tail` | `runCommandStreaming` callback → deployment log |
| **Queue** | Laravel queue `tries=1` + retryable SSH loop | In-memory per-partition FIFO + per-group serialization, concurrency 1 | DB `deployments` table + `WaitForDeploys` |
| **Cleanup** | `docker rm -f` with `timeout -k 60s`, delayed `RemoveContainerJob` | `dockerSafeExec` idle wait, `prune --force`, keep 10 deployments | `AutoPruneAfterDeploy`, `prune` via manager |
| **Clone** | `--depth=1 --recurse-submodules --shallow-submodules`, `insteadOf` token, `fetch <commit> + checkout` | `--branch --depth 1 --recurse-submodules --progress` | `--depth=1 --branch` with busybox fallback → full clone |

---

## 9. Patterns Applied to NanoFly

### v0.3.42

- **Remove `.git` after clone** (`os.RemoveAll(repoDir/.git)`) — context 78 MB → ~30 MB.
- **Comprehensive `.dockerignore` merge** — 70+ entries (deps, build outputs, tests, IDE, Git, Docker, env, logs, cache, docs, CI/CD, configs, OS, Python/Go/Rust, AI tools, `*.zip`).
- **`DOCKER_BUILDKIT=1`** env for `docker` + `nixpacks`.
- **`--pull`** for fresh base images.
- **`--progress=plain`** for structured logs.
- **Context size log** — `filepath.Walk` → `Build context: X MB`.

### v0.3.44

- **`optimizeExistingDockerfile()`** — patches repo Dockerfiles before build:
  - `# syntax=docker/dockerfile:1` header
  - `RUN npm ci` → `RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund` (same for `npm install`, `yarn`, `pnpm` with correct cache paths)
  - `ENV NEXT_TELEMETRY_DISABLED=1` injection after first `FROM` for Next.js
- **Multi-stage Next.js templates** — detects `package.json` containing `"next"`, checks `next.config.*` for `standalone`:
  - **Standalone:** `deps (npm ci) → builder (build) → runner (server.js)` with `chown nextjs:nodejs`, `public` + `standalone` + `static`.
  - **Non-standalone:** `deps → builder → runner` with `.next` + `public` + `node_modules` + `package.json`.
  - All stages `NEXT_TELEMETRY_DISABLED=1`, cache mounts, `--no-audit --no-fund`.

### v0.3.45

- **`--network=host`** added to `docker build`.
- **Build-time env vars as `--build-arg`** — queries `env_vars` table, appends `--build-arg K=V` for each.
- **`injectBuildArgsToDockerfile()`** — inserts `ARG K` after every `FROM` (reverse-order splice) so `--build-arg` values are available during build. Skips existing `ARG K`.

---

## 10. Raw Source URLs

All fetched via `WebFetch` — re-fetch for verification:

**Platform A:**

- `https://raw.githubusercontent.com/coollabsio/coolify/main/app/Jobs/ApplicationDeploymentJob.php`
- `https://raw.githubusercontent.com/coollabsio/coolify/main/docker/coolify-helper/Dockerfile`
- `https://raw.githubusercontent.com/coollabsio/coolify/main/.dockerignore`
- `https://raw.githubusercontent.com/coollabsio/coolify/main/app/Actions/Shared/CheckDomainDns.php` (Cloudflare)
- `https://raw.githubusercontent.com/coollabsio/coolify/main/app/Support/DomainConnect/CloudflareDomainConnect.php`
- `https://raw.githubusercontent.com/coollabsio/coolify/main/app/Services/DockerImageParser.php`

**Platform B:**

- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/builders/index.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/builders/docker-file.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/builders/nixpacks.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/builders/railpack.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/builders/static.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/builders/compose.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/docker/utils.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/services/application.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/packages/server/src/utils/process/execAsync.ts`
- `https://raw.githubusercontent.com/Dokploy/dokploy/canary/apps/dokploy/components/dashboard/application/build/show.tsx`

> Note: Platform B `main` branch 404s for many paths — use `canary` branch.

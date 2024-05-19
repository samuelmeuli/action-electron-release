const { execSync } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const { join } = require("path");

/**
 * Logs to the console
 */
const log = (msg) => console.log(`\n${msg}`); // eslint-disable-line no-console

/**
 * Exits the current process with an error code and message
 */
const exit = (msg) => {
	console.error(msg);
	process.exit(1);
};

/**
 * Executes the provided shell command and redirects stdout/stderr to the console
 */
const run = (cmd, cwd) => execSync(cmd, { encoding: "utf8", stdio: "inherit", cwd });

/**
 * Determines the current operating system (one of ["mac", "windows", "linux"])
 */
const getPlatform = () => {
	switch (process.platform) {
		case "darwin":
			return "mac";
		case "win32":
			return "windows";
		default:
			return "linux";
	}
};

/**
 * Returns the value for an environment variable (or `null` if it's not defined)
 */
const getEnv = (name) => process.env[name.toUpperCase()] || null;

/**
 * Sets the specified env variable if the value isn't empty
 */
const setEnv = (name, value) => {
	if (value) {
		process.env[name.toUpperCase()] = value.toString();
	}
};

/**
 * Returns the value for an input variable (or `null` if it's not defined). If the variable is
 * required and doesn't have a value, abort the action
 */
const getInput = (name, required) => {
	const value = getEnv(`INPUT_${name}`);
	if (required && !value) {
		exit(`"${name}" input variable is not defined`);
	}
	return value;
};

const getPackageManager = (pkgRoot, appRoot, pkgJsonPath, buildScriptName) => {
	const pnpmLockPath = join(pkgRoot, "pnpm-lock.yaml");
	if (existsSync(pnpmLockPath)) {
		return {
			build: () => run(`pnpm run ${buildScriptName}`, pkgRoot),
			compile: (command) => run(`pnpm exec ${command}`, appRoot),
			install: () => run("pnpm install", pkgRoot),
			name: "PNPM",
		};
	}

	const pkgLockPath = join(pkgRoot, "package-lock.json");
	if (existsSync(pkgLockPath)) {
		return {
			build: () => run(`npm run ${buildScriptName} --if-present`, pkgRoot),
			compile: (command) => run(`npx --no-install run ${command}`, appRoot),
			install: () => run("npm install", pkgRoot),
			name: "NPM",
		};
	}

	return {
		build: () => {
			// TODO: Use `yarn run ${buildScriptName} --if-present` once supported
			// https://github.com/yarnpkg/yarn/issues/6894
			const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

			if (pkgJson.scripts && pkgJson.scripts[buildScriptName]) {
				run(`yarn run ${buildScriptName}`, pkgRoot);
			}
		},
		compile: (command) => run(`yarn run ${command}`, appRoot),
		install: () => run("yarn", pkgRoot),
		name: "Yarn",
	};
};

/**
 * Installs NPM dependencies and builds/releases the Electron app
 */
const runAction = () => {
	const platform = getPlatform();
	const release = getInput("release", true) === "true";
	const pkgRoot = getInput("package_root", true);
	const buildScriptName = getInput("build_script_name", true);
	const skipBuild = getInput("skip_build") === "true";
	const useVueCli = getInput("use_vue_cli") === "true";
	const args = getInput("args") || "";
	const maxAttempts = Number(getInput("max_attempts") || "1");

	// TODO: Deprecated option, remove in v2.0. `electron-builder` always requires a `package.json` in
	// the same directory as the Electron app, so the `package_root` option should be used instead
	const appRoot = getInput("app_root") || pkgRoot;

	const pkgJsonPath = join(pkgRoot, "package.json");

	// Make sure `package.json` file exists
	if (!existsSync(pkgJsonPath)) {
		exit(`\`package.json\` file not found at path "${pkgJsonPath}"`);
	}

	const packageManager = getPackageManager(pkgRoot, appRoot, pkgJsonPath, buildScriptName);

	// Determine whether NPM should be used to run commands (instead of Yarn, which is the default)
	log(`Will run ${packageManager.name} commands in directory "${pkgRoot}"`);

	// Copy "github_token" input variable to "GH_TOKEN" env variable (required by `electron-builder`)
	setEnv("GH_TOKEN", getInput("github_token", true));

	// Require code signing certificate and password if building for macOS. Export them to environment
	// variables (required by `electron-builder`)
	if (platform === "mac") {
		setEnv("CSC_LINK", getInput("mac_certs"));
		setEnv("CSC_KEY_PASSWORD", getInput("mac_certs_password"));
	} else if (platform === "windows") {
		setEnv("CSC_LINK", getInput("windows_certs"));
		setEnv("CSC_KEY_PASSWORD", getInput("windows_certs_password"));
	}

	// Disable console advertisements during install phase
	setEnv("ADBLOCK", true);

	log(`Installing dependencies using ${packageManager.name}…`);
	packageManager.install();

	// Run NPM build script if it exists
	if (skipBuild) {
		log("Skipping build script because `skip_build` option is set");
	} else {
		log("Running the build script…");
		packageManager.build();
	}

	log(`Building${release ? " and releasing" : ""} the Electron app…`);
	const cmd = useVueCli ? "vue-cli-service electron:build" : "electron-builder";
	for (let i = 0; i < maxAttempts; i += 1) {
		try {
			packageManager.compile(`${cmd} --${platform} ${release ? "--publish always" : ""} ${args}`);
			break;
		} catch (err) {
			if (i < maxAttempts - 1) {
				log(`Attempt ${i + 1} failed:`);
				log(err);
			} else {
				throw err;
			}
		}
	}
};

runAction();

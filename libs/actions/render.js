// * ———————————————————————————————————————————————————————— * //
// * 	enduro.actions.render
// * ———————————————————————————————————————————————————————— * //

const action = function () {}

const fs = require('fs')
const path = require('path')

const logger = require(enduro.enduro_path + '/libs/logger')
const juicebox = require(enduro.enduro_path + '/libs/juicebox/juicebox')
const global_data = require(enduro.enduro_path + '/libs/global_data')
const helper_handler = require(enduro.enduro_path + '/libs/helper_handler')
const components_handler = require(enduro.enduro_path + '/libs/components_handler')
const enduro_render = require(enduro.enduro_path + '/libs/enduro_render')
const gulp_tasks = require(enduro.enduro_path + '/libs/build_tools/gulp_tasks')
const pregenerator = require(enduro.enduro_path + '/libs/pregenerator/pregenerator')
const abstractor = require(enduro.enduro_path + '/libs/abstractor/abstractor')
const ab_tester = require(enduro.enduro_path + '/libs/ab_testing/ab_tester')
const markdownifier = require(enduro.enduro_path + '/libs/markdown/markdownifier')
const event_hooks = require(enduro.enduro_path + '/libs/external_links/event_hooks')
const brick_handler = require(enduro.enduro_path + '/libs/bricks/brick_handler')

function render_lockfile_path (name = 'rendering') {
	return path.join(enduro.project_path, enduro.config.build_folder, `.${name}.lock`)
}

function is_render_locked (name = 'rendering') {
	return fs.existsSync(render_lockfile_path(name))
}

function capture_render_lock ({ name = 'rendering', safe = false } = {}) {
	var fd, err

	console.log(`RENDER-LOCK-CAPTURE ${name}`)

	try {
		// Open new lockfile, fail if it already exists
		fd = fs.openSync(render_lockfile_path(name), 'wx')
	} catch (e) {
		if (safe && e.code === 'EEXIST') return false
		throw e // no other safe errors to handle
	}

	try {
		fs.writeFileSync(fd, '')
		fs.fsyncSync(fd)
	} catch (e) {
		err = e
	} finally {

		try {
			fs.closeSync(fd)
		} catch (e) {
			console.error(err.stack) // Make sure we know that happened before this
			err = e
		}

	}

	if (err) throw err

	return true
}

function release_render_lock ({ name = 'rendering', safe = false } = {}) {
	console.log(`RENDER-LOCK-RELEASE ${name}`)
	try {
		fs.unlinkSync(render_lockfile_path(name))
	} catch (e) {
		if (safe && e.code === 'ENOENT') return false
		throw e // no other safe errors to handle
	}

	return true
}

function render (dont_do_juice_pull) {
	logger.init('Enduro', 'enduro_render_events')

	return Promise.resolve()
		.then(() => {
			if (!dont_do_juice_pull && !enduro.flags.nojuice) {
				return juicebox.pull(false)
			} else {
				return Promise.resolve()
			}
		})
		.then(() => {
			return brick_handler.load_bricks()
		})
		.then(() => {
			return global_data.get_global_data()
		})
		.then(() => {
			return components_handler.read_components()
		})
		.then(() => {
			return helper_handler.read_helpers()
		})
		.then(() => {
			return abstractor.init()
		})
		.then(() => {
			return markdownifier.precompute()
		})
		.then(() => {
			return ab_tester.generate_global_ab_list()
		})
		.then(() => {
			return pregenerator.pregenerate()
		})
		.then(() => {
			return new Promise(function (resolve, reject) {
				return gulp_tasks.start('preproduction', () => {
					resolve()
				})
			})
		})
		.then(() => {
			return enduro_render.render()
		})
		.then(() => {
			if (enduro.post_render) {
				return enduro.post_render()
			}
		})
		.then(() => {
			return new Promise(function (resolve, reject) {
				return gulp_tasks.start('production', () => {
					resolve()
				})
			})
		})
		.then(() => {
			return event_hooks.execute_hook('post_update')
		})
		.then(() => {
			logger.end('enduro_render_events')
		})
}

action.prototype.action = function (dont_do_juice_pull, lock = false) {
	if (lock === 'patient_lock' && is_render_locked()) {
		if (!capture_render_lock({ name: 'rendering-queue', safe: true })) {
			console.warn('RENDER-LOCK already queued')
			return Promise.resolve()
		}

		return new Promise((resolve, reject) => {
			setTimeout(() => {
				capture_render_lock({ safe: true })
				release_render_lock({ name: 'rendering-queue' })
				render(dont_do_juice_pull).then((result) => {
					release_render_lock()
					resolve(result)
				}, (err) => {
					try {
						release_render_lock({ safe: true })
					} catch (e) {
						console.error(`Error trying to unlock rendering ${e.stack}`)
					}
					reject(err)
				})
			}, 30000)
		})
	}

	if (lock) capture_render_lock()

	return render(dont_do_juice_pull).then((result) => {
		if (lock) release_render_lock()
		return result
	}, (err) => {
		if (lock) {
			try {
				release_render_lock({ safe: true })
			} catch (e) {
				console.error(`Error trying to unlock rendering ${e.stack}`)
			}
		}

		throw err
	})
}

module.exports = new action()

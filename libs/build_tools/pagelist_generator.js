// * ———————————————————————————————————————————————————————— * //
// * 	pagelist generator
// *	goes through all the pages and generates a json from them
// *
// *	pagelist json is saved and get_cms_list() will quickly retrieve it without
// *	generation it again
// *
// *	pagelist generator will generate two lists - a structured and flat list
// * ———————————————————————————————————————————————————————— * //
const pagelist_generator = function () {}

// * vendor dependencies
const Promise = require('bluebird')
const fs = require('fs-extra')
const glob = require('glob')
const extend = require('extend')
const path = require('path')

// * enduro dependencies
const flat_helpers = require(enduro.enduro_path + '/libs/flat_db/flat_helpers')
const format_service = require(enduro.enduro_path + '/libs/services/format_service')
const flat = require(enduro.enduro_path + '/libs/flat_db/flat')
const rerouting = require(enduro.enduro_path + '/libs/page_rendering/rerouting')

// * ———————————————————————————————————————————————————————— * //
// * 	init
// *
// * 	registers generating and saving the pagelist to gulp
// *	additionaly it will expand the global data with the pagelist
// *	@param {object} gulp - gulp to register the task into
// *	@return {} - will call an empty callback
// * ———————————————————————————————————————————————————————— * //
pagelist_generator.prototype.init = function (gulp) {
	const self = this

	const pagelist_generator_task_name = 'pagelist_generator'

	// adds task to gulp
	gulp.task(pagelist_generator_task_name, function (cb) {

		// generates cmslist
		self.generate_cms_list()
			.then((cmslist) => {

				// Extends global data with currently loaded data
				extend(true, enduro.cms_data.global, {cmslist: cmslist})

				return self.save_cms_list(cmslist)
			})
			.then(() => {
				cb()
			})
	})

	// returns name of the task so it can be stored and called comfortably
	return pagelist_generator_task_name
}

// * ———————————————————————————————————————————————————————— * //
// * 	generate cms list
// *
// * 	generates list of pages with global datasets and generators
// *	@return {promise} - promise with cmslist
// * ———————————————————————————————————————————————————————— * //
pagelist_generator.prototype.generate_cms_list = function () {
	return new Promise(function (resolve, reject) {
		rerouting.get_rerouter().then((rerouter) => {
			glob(enduro.project_path + '/cms/**/*.js', function (err, files) {
				if (err) { console.log('failed to generate cms list', err) }

				let pagelist = {}
				let flat_pagelist = []
				let tree_pagelist = { $children: {} }
				let add_to_tree_promises = []

				function promise_add_to_tree (item) {
					var parent = tree_pagelist
					var destination_path = flat.filepath_from_filename(item.fullpath.replace(/^\//, ''))

					item = Object.assign({}, item)

					add_to_tree_promises.push(
						rerouter(destination_path).then((_destination_path) => {
							if (_destination_path) {
								destination_path = _destination_path
							}

							let path_parts = destination_path.split('/')

							if (path_parts[ path_parts.length - 1 ] === 'index') {
								path_parts.pop()
							}

							for (let i = 0; i < path_parts.length; i++) {
								let key = path_parts[i]
								if (!(key in parent.$children)) {
									parent.$children[key] = { $children: {} }
								}
								parent = parent.$children[key]
							}

							Object.assign(parent, item, {
								// destination_path: destination_path,
								uri: `/${destination_path.replace(/(^|\/)index$/, '')}`
							})
						})
					)
				}

				// helper function to build the pagelist
				function build (pagepath, partial_pages, fullpath) {
					var item = {
						fullpath: '/' + fullpath.join('/'),
						name: format_service.prettify_string(pagepath[0]),
						slug: pagepath[0].toString()
					}

					if (pagepath.length == 1) { // pagepath is file
						item.page_slug = item.slug

						// mark generator template as hidden
						if (fullpath[0] == 'generators' && fullpath.length >= 2 && fullpath[fullpath.length - 2] == fullpath[fullpath.length - 1]) {
							item.hidden = true
						} else {
							promise_add_to_tree(item)
						}

						item.page = true

						if (partial_pages[item.slug]) { // item is both page and folder
							Object.assign(item, partial_pages[item.slug])
						}

						partial_pages[item.slug] = item
						flat_pagelist.push(item)
					} else { // else pagepath is folder
						// remove templates from pagelist
						if (pagepath[0] == 'templates') return

						item.folder = true
						item.folder_slug = item.slug

						if (fullpath[0] == 'generators' && pagepath.length != fullpath.length) {
							item.generator = true
						}

						// global and generators receive special treatment and the subfolders are not created
						if (item.name.toLowerCase() == 'global' || item.name.toLowerCase() == 'generators') {
							return build(pagepath.slice(1), partial_pages, fullpath)
						}

						if (partial_pages[item.slug]) { // item is both page and folder
							Object.assign(item, partial_pages[item.slug])
						}

						partial_pages[item.slug] = item
						build(pagepath.slice(1), partial_pages[item.slug], fullpath)
					}
				}

				const cms_prefix = enduro.project_path + '/cms'
				files = files.sort((a, b) => {
					var a_is_generator = a.startsWith(cms_prefix + '/generators')
					var b_is_generator = b.startsWith(cms_prefix + '/generators')
					var a_is_global = a.startsWith(cms_prefix + '/global')
					var b_is_global = b.startsWith(cms_prefix + '/global')

					a = a.slice(cms_prefix.length).replace(/^\/generators/, '')
					b = b.slice(cms_prefix.length).replace(/^\/generators/, '')

					if (a_is_global && !b_is_global) return 1
					if (!a_is_global && b_is_global) return -1

					if (a < b) return -1
					if (a > b) return 1

					if (a == b) {
						if (a_is_generator && !b_is_generator) return 1
						if (!a_is_generator && b_is_generator) return -1
					}

					return 0
				})

				// goes throught the glob, crops the filename and builds a pagelist
				files.map((file) => {
					return file.match('/cms/(.*).js')[1].split('/')
				}).forEach((pagepath) => {
					build(pagepath, pagelist, pagepath)
				})

				Promise.all(add_to_tree_promises).then(() => {
					var composed_pagelist = {
						structured: pagelist,
						flat: flat_pagelist,
						tree: tree_pagelist
					}

					resolve(composed_pagelist)
				})
			})
		})
	})
}

// * ———————————————————————————————————————————————————————— * //
// * 	save cms list
// *
// * 	saves the cmslist to predefined path
// *	@return {promise} - promise with cmslist
// * ———————————————————————————————————————————————————————— * //
pagelist_generator.prototype.save_cms_list = function (cmslist) {
	const self = this

	return new Promise(function (resolve, reject) {

		// regenerates pagelist_desination in case cmd_folder has changed
		pagelist_destination = self.get_pregenerated_pagelist_path()

		// Saves the cmslist into a specified file
		flat_helpers.ensure_directory_existence(pagelist_destination)
			.then(() => {
				fs.writeFile(pagelist_destination, JSON.stringify(cmslist), function (err) {
					if (err) { console.log(err) }
					resolve(cmslist)
				})
			})
	})
}

// * ———————————————————————————————————————————————————————— * //
// * 	get cms list
// *
// *	generates and returns the cms list
// *	@return {promise} - promise with cmslist
// * ———————————————————————————————————————————————————————— * //
pagelist_generator.prototype.get_cms_list = function () {
	const self = this
	return self.generate_cms_list()
}

// * ———————————————————————————————————————————————————————— * //
// * 	pregenerated pagelist path
// *
// * 	global acccessible pagelist path
// *	@return {promise} - promise with cmslist
// * ———————————————————————————————————————————————————————— * //
pagelist_generator.prototype.get_pregenerated_pagelist_path = function () {
	return path.join(enduro.project_path, enduro.config.build_folder, '_prebuilt', 'cmslist.json')
}

module.exports = new pagelist_generator()

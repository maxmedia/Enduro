// * ———————————————————————————————————————————————————————— * //
// * 	enduro render
// *	renders individual page based on source template, context and culture
// * ———————————————————————————————————————————————————————— * //
const page_queue_generator = function () {}

// * vendor dependencies
const glob = require('glob-promise')
const path = require('path')

// * enduro dependencies
const flat = require(enduro.enduro_path + '/libs/flat_db/flat')
const rerouting = require('./rerouting')

// Renders individual files
page_queue_generator.prototype.generate_pagelist = function () {

	const self = this

	// Reads the culture config file and gets cultures and sets them to the global enduro.config.cultures variable
	return self.get_all_pages().then((files) => {

		let all_pages_to_render = []
		let pages_to_render = []

		// iterates over files and fill all_pages_to_render list
		for (f in files) {
			for (c in enduro.config.cultures) {

				let page_to_render = {}

				// absolute path to page template file
				page_to_render.file = files[f]

				// relative, 'flat' path to cms file
				page_to_render.context_file = self.get_page_url_from_full_path(files[f])

				// culture string
				page_to_render.culture = enduro.config.cultures[c]

				// destination path
				if (page_to_render.context_file.endsWith('index')) {
					page_to_render.destination_path = page_to_render.context_file
				} else {
					page_to_render.destination_path = page_to_render.context_file + '/index'
				}

				// true if page is generator
				page_to_render.generator = flat.is_generator(page_to_render.context_file)

				// push to pages to render list
				all_pages_to_render.push(page_to_render)
			}
		}

		let generators = []

		for (i in all_pages_to_render) {
			if (all_pages_to_render[i].generator) {
				generators.push(self.add_generator_pages(pages_to_render, all_pages_to_render[i]))
			} else {
				pages_to_render.push(all_pages_to_render[i])
			}
		}

		return Promise.all(generators).then(() => {
			return rerouting.reroute_paths(pages_to_render)
		})
	})
}

// generate list of pages that needs to be generated by generator
page_queue_generator.prototype.add_generator_pages = function (pages_to_render, page_context) {

	// fetch all context files from folder of the same name as the template name
	return glob(path.join(enduro.project_path, 'cms', page_context.context_file, '**/*.js'))
		.then((files) => {

			// iterate found context files and add them to the provided list
			for (f in files) {

				// clone the generator object
				context_clone = JSON.parse(JSON.stringify(page_context))

				// path to new context file
				context_clone.context_file = flat.get_cms_filename_from_fullpath(files[f])

				// sets new destination path, removing the /generator from the path
				context_clone.destination_path = flat.filepath_from_filename(context_clone.context_file)

				// push to provided page list
				pages_to_render.push(context_clone)
			}

		})
}

page_queue_generator.prototype.get_all_pages = function () {
	return glob(enduro.project_path + '/pages/**/*.hbs')
}

page_queue_generator.prototype.get_page_url_from_full_path = function (full_path) {
	return full_path.match(/pages\/(.*)\.([^\\/]+)$/)[1]
}

module.exports = new page_queue_generator()

const fs = require('fs')
const path = require('path')

/**
 * Rerouter definition.  Defined in `rerouter.js` in root of application path.
 * @function makeRerouter
 * @param {Object} enduro
 * @returns {Function<rerouter>}
 * @example
 * module.exports = function makeRerouter(enduro) {
 *   function getPageData(structuredKey, slug) {
 *     return enduro.api.pagelist_generator.get_cms_list().then((pagelist) => {
 *       var pages = pagelist.structured[structuredKey];
 *       if (!pages || !pages[slug]) return;
 *       return enduro.api.flat.load(pages[slug].fullpath);
 *     });
 *   }
 *
 *   function rerouteBlogDetail(blogDetailSlug) {
 *     return getPageData('blog-detail', blogDetailSlug).then((pageData) => {
 *       if (!pageData || !pageData.category) return; // don't reroute
 *       return `blog/${pageData.category}/${blogDetailSlug}/index`;
 *     });
 *   }
 *
 *   return function rerouter(destinationPath) {
 *     var blogDetailPathMatch = destinationPath.match(/^(blog-detail)\/(.+)\/index$/);
 *     if (blogDetailPathMatch) {
 *       return rerouteBlogDetail(blogDetailPathMatch[2]);
 *     }
 *     return new Promise(resolve => resolve());
 *   };
 * };
 * @example
 * module.exports = function makeRerouter(enduro) {
 *   var pagelist;
 *
 *   async function getPageData(structuredKey, slug) {
 *     if (!pagelist) {
 *       pagelist = await enduro.api.pagelist_generator.get_cms_list();
 *     }
 *
 *     let pages = pagelist.structured[structuredKey];
 *     if (!pages || !pages[slug]) return;
 *     return await enduro.api.flat.load(pages[slug].fullpath);
 *   }
 *
 *   async function rerouteBlogDetail(blogDetailSlug) {
 *     var pageData = await getPageData('blog-detail', blogDetailSlug);
 *     if (!pageData || !pageData.category) return; // don't reroute
 *     return `blog/${pageData.category}/${blogDetailSlug}/index`;
 *   }
 *
 *   return async function rerouter(destinationPath) {
 *     var blogDetailPathMatch = destinationPath.match(/^(blog-detail)\/(.+)\/index$/);
 *     if (blogDetailPathMatch) {
 *       let newPath = await rerouteBlogDetail(blogDetailPathMatch[2]);
 *       if (newPath) {
 *         console.log(`Rerouting ${destinationPath} -> ${newPath}`);
 *       }
 *       return newPath;
 *     }
 *     // else don't reroute
 *   };
 * };
 */

/**
 * Rerouter function
 * @function rerouter
 * @param {string} destinationPath original destination path
 * @return {Promise<string>} new `destinationPath` or falsey
 */

/**
 * Default rerouter (i.e. doesn't reroute any paths)
 * @param {string} destinationPath original destination path
 * @return {Promise<string>} new `destinationPath` or falsey
 */
const DEFAULT_REROUTER = (destinationPath) => {
	return new Promise(resolve => resolve())
}

/**
 * Loads and sets-up the rerouter
 * @returns {rerouterPromise|false} rerouter function or false if rerouter is not defined
 */
function get_rerouter () {
	return new Promise((resolve, reject) => {
		if (!fs.existsSync(path.join(enduro.project_path, 'rerouter.js'))) {
			return resolve(DEFAULT_REROUTER)
		}

		try {
			let makeRerouter = require(path.join(enduro.project_path, 'rerouter.js'))
			let rerouter = makeRerouter(enduro)
			resolve(rerouter)
		} catch (e) {
			console.warn(`Error loading rerouter: ${e.stack}`)
			reject(e)
		}
	})
}
exports.get_rerouter = get_rerouter

/**
 * Creates Promises to reroute each item in `pages_to_render`.
 * @private
 * @param {rerouterPromise}
 * @param {Object[]} pages_to_render
 * @returns {Promise[]}
 */
function reroute_paths_promises (rerouter, pages_to_render) {
	return pages_to_render.map((page_to_render) => {
		return rerouter(page_to_render.destination_path).then((destination_path) => {
			if (destination_path) {
				page_to_render.destination_path = destination_path
			}
			return page_to_render
		})

	})
}

/**
 * Gets the rerouter then sets-up a `Promise.all` to reroute each item in `pages_to_render` if a
 * rerouter is defined.
 * @param {Object[]} pages_to_render
 * @returns {Promise}
 */
exports.reroute_paths = function reroute_paths (pages_to_render) {
	return get_rerouter().then((rerouter) => {
		if (!rerouter) return pages_to_render
		return Promise.all(reroute_paths_promises(rerouter, pages_to_render))
	})
}

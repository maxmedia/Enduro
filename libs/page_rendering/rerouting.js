const fs = require('fs')
const path = require('path')

/**
 * Rerouter definition.  Defined in `rerouter.js` in root of application path.
 * @function rerouter
 * @param {Object} enduro
 * @returns {Promise<rerouterPromise>}
 * @example
 * module.exports = function rerouter(enduro) {
 *   var pagelist;
 *
 *   function getArticleCategorySlug(articlePathMatch) {
 *     // uses pagelist.structured.article to find article's category slug
 *   }
 *
 *   function rerouteArticle(articlePathMatch) {
 *     var categorySlug = getArticleCategorySlug(articlePathMatch);
 *     if (!categorySlug) return; // don't reroute
 *     return [ articlePathMatch[1], categorySlug, articlePathMatch[2] ].join('/');
 *   }
 *
 *   function rerouterPromise(destinationPath) {
 *     // @see rerouterPromise
 *   };
 *
 *   return enduro.api.pagelist_generator.get_cms_list().then((_pagelist) => {
 *     pagelist = _pagelist;
 *     return rerouterPromise;
 *   });
 * };
 * @example
 * module.exports = async function rerouter(enduro) {
 *   var pagelist = await enduro.api.pagelist_generator.get_cms_list();
 *
 *   function getArticleCategorySlug(articlePathMatch) {
 *     // uses pagelist.structured.article to find article's category slug
 *   }
 *
 *   function rerouteArticle(articlePathMatch) {
 *     var categorySlug = getArticleCategorySlug(articlePathMatch);
 *     if (!categorySlug) return; // don't reroute
 *     return [ articlePathMatch[1], categorySlug, articlePathMatch[2] ].join('/');
 *   }
 *
 *   return async (destinationPath) => {
 *     var articlePathMatch = /^(\/article)\/(.+)/.exec(destinationPath);
 *     if (articlePathMatch) {
 *       let newPath = rerouteArticle(articlePathMatch);
 *       return newPath;
 *     }
 *     // else don't reroute
 *   };
 * };

 */

/**
 * Rerouter function
 * @function rerouterPromise
 * @param {string} destinationPath original destinationPath
 * @return {Promise<string>} new `destinationPath` or falsey
 * @example
 * function rerouterPromise(destinationPath) {
 *   return new Promise((resolve, reject) => { //eslint-disable-line no-unused-vars
 *     let articlePathMatch = /^(\/article)\/(.+)/.exec(destinationPath);
 *     if (articlePathMatch) {
 *       try {
 *         let newPath = rerouteArticle(articlePathMatch);
 *         return resolve(newPath);
 *       } catch (e) {
 *         return reject(e);
 *       }
 *     }
 *     resolve(); // else don't reroute
 *   });
 * };
 * @example
 * async function rerouterPromise(destinationPath) {
 *   var articlePathMatch = /^(\/article)\/(.+)/.exec(destinationPath);
 *   if (articlePathMatch) {
 *     let newPath = rerouteArticle(articlePathMatch);
 *     return newPath;
 *   }
 *   // else don't reroute
 * };
 */

/**
 * Loads and sets-up the rerouter
 * @private
 * @returns {rerouterPromise|false} rerouter function or false if rerouter is not defined
 */
function get_rerouter () {
	return new Promise((resolve, reject) => {
		if (fs.existsSync(path.join(enduro.project_path, 'rerouter.js'))) {
			let makeRerouter = require(path.join(enduro.project_path, 'rerouter.js'))
			return makeRerouter(enduro).then(resolve, reject)
		}
		return resolve(false)
	})
}

/**
 * Creates Promises to reroute each item in `pages_to_render`.
 * @private
 * @param {rerouterPromise}
 * @param {Object[]} pages_to_render
 * @returns {Promise[]}
 */
function reroute_paths_promises (rerouter, pages_to_render) {
	return pages_to_render.map((page_to_render) => {
		return new Promise((resolve, reject) => {
			rerouter(page_to_render.destination_path).then((destination_path) => {
				if (destination_path) {
					page_to_render.destination_path = destination_path
				}
				resolve(page_to_render)
			}, reject)
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
		if (!rerouter) return
		return Promise.all(reroute_paths_promises(rerouter, pages_to_render))
	})
}

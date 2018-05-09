const fs = require('fs')
const path = require('path')
const AWS = require('aws-sdk')
const get_digest = require('../get-digest')

function list_files_recursive (dir) {
	return fs.readdirSync(dir)
		.filter(fn => !fn.startsWith('.'))
		.map(fn => path.join(dir, fn))
		.reduce((files, fn) => {
			var stat = fs.statSync(fn)
			if (stat.isDirectory()) {
				return files.concat(list_files_recursive(fn))
			}
			files.push(fn)
			return files
		}, [])
}

function list_local (build_path) {
	return new Promise((resolve, reject) => {
		resolve(new Map(
			list_files_recursive(build_path)
				.map(fn => path.relative(build_path, fn))
				.filter(fn => ![ '_prebuilt', 't' ].includes(fn.split(path.sep)[0]))
				.map(fn => [ fn, {} ])
		))
	})
}

function list_local_with_digests (build_path) {
	return list_local(build_path)
		.then((files) => {
			var digest_promises = Array.from(files.keys()).map((fn) => {
				return get_digest(path.join(build_path, fn))
			})

			return Promise.all(digest_promises)
				.then((file_digests) => {
					var i = 0
					for (let obj of files.values()) {
						obj.digest = file_digests[i++]
					}
					return files
				})
		})
}

function list_remote (s3) {
	var result = new Map()

	return new Promise((resolve, reject) => {
		function _list_objects (params = {}) {
			s3.listObjectsV2(params, (err, data) => {
				if (err) return reject(err)

				for (let c of data.Contents) {
					if (/^(\.|(direct_uploads(_[^\/]+)?\/)|juicebox\/)/.test(c.Key)) continue
					result.set(c.Key, c)
				}

				if (data.NextContinuationToken) {
					return _list_objects({ ContinuationToken: data.NextContinuationToken })
				}

				resolve(result)
			})
		}

		_list_objects()
	})
}

function get_head (s3, key) {
	return new Promise((resolve, reject) => {
		s3.headObject({ Key: key }, (err, data) => {
			if (err) return reject(err)
			resolve(data)
		})
	})
}

function list_remote_with_heads (s3) {
	return list_remote(s3)
		.then((objects) => {
			var head_promises = Array.from(objects.keys()).map((key) => {
				return get_head(s3, key)
			})

			return Promise.all(head_promises)
				.then((object_heads) => {
					var i = 0
					for (let obj of objects.values()) {
						Object.assign(obj, object_heads[i++])
					}
					return objects
				})
		})
}

function pre_publish (actions, options) {
	if (enduro.pre_publish) {
		return enduro.pre_publish(actions, options)
	}
	return Promise.resolve(actions)
}

module.exports = function status (options = {}) {
	const build_path = path.join(enduro.project_path, enduro.config.build_folder)

	var s3 = new AWS.S3({
		accessKeyId: enduro.config.variables.S3_KEY,
		secretAccessKey: enduro.config.variables.S3_SECRET,
		region: enduro.config.s3.region,
		params: {
			Bucket: enduro.config.s3.bucket
		}
	})

	return Promise.all([
		list_local_with_digests(build_path),
		list_remote_with_heads(s3)
	])
		.then((t) => {
			var local = t[0]
			var remote = t[1]
			var result = new Map([])

			var keys = Array.from(local.keys()).concat(Array.from(remote.keys())).sort()
			for (let key of keys) {
				if (result.has(key)) continue

				if (local.has(key) && !remote.has(key)) {
					result.set(key, 'new')
				} else if (!local.has(key) && remote.has(key)) {
					result.set(key, 'delete')
				} else if (local.get(key).digest !== remote.get(key).Metadata.digest) {
					result.set(key, 'put')
				} else {
					result.set(key, '')
				}
			}

			return result
		})
		.then((actions) => pre_publish(actions, options))
}

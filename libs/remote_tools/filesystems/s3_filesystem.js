// * ———————————————————————————————————————————————————————— * //
// * 	remote handler
// *	uploads files to s3
// * ———————————————————————————————————————————————————————— * //
const filesystem = function () {}

const url = require('url')
const AWS = require('aws-sdk')
const mime = require('mime-types')

// * enduro dependencies
const logger = require(enduro.enduro_path + '/libs/logger')

filesystem.prototype.init = function () {
	// no init required
}

filesystem.prototype.upload = function (filename, path_to_file) {
	const destination_url = this.get_remote_url(filename)

	var s3 = new AWS.S3({
		accessKeyId: enduro.config.variables.S3_KEY,
		secretAccessKey: enduro.config.variables.S3_SECRET,
		region: enduro.config.s3.region,
		params: {
			Bucket: enduro.config.s3.bucket
		}
	})

	return new Promise((resolve, reject) => {
		s3.upload({
			Key: filename,
			Body: fs.createReadStream(path_to_file),
			ContentType: mime.contentType(path.extname(filename)),
			CacheControl: 'public, max-age=31536000'
		}, (err, data) => {
			if (err) {
				console.error(`uploadiung failed ${filename} ${err.stack}`)
				return reject(err)
			}
			logger.timestamp(`File uploaded successfully: ${destination_url}`)
			resolve(destination_url)
		})
	})
}

filesystem.prototype.get_remote_url = function (filename, juicebox) {
	var remoteUrl = {
		scheme: 'https',
		hostname: `s3-${enduro.config.s3.region}.amazonaws.com`,
		pathname: `/${enduro.config.s3.bucket}/${filename}`
	}

	if (enduro.config.s3.region === 'us-east-1') {
		remoteUrl.hostname = 's3.amazonaws.com'
	}

	if (enduro.config.s3.cloudfront && !juicebox) {
		remoteUrl.hostname = enduro.config.s3.cloudfront
		remoteUrl.pathname = `/${filename}`
	}

	return url.format(remoteUrl)
}

module.exports = new filesystem()

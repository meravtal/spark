const AWS = require('aws-sdk'),
config = require('config'),
awsConfig = config.get('aws_config'),
Archiver = require('archiver')

class s3Client {

    constructor() {
        this.s3 = new AWS.S3({region: awsConfig.defualt_region})
    }

    /**
     * Put a file buffer to S3
     * @param {the name of the object in S3} fileName
     * @param {the file buffer we would like to put} fileBuffer
     * @param {the bucket where the object should be put} bucket
     * @param {if specified, overriders the default spark region} region
     */
    uploadFileBuffer(fileName, fileBuffer, bucket, region) {
        // Check if maybe we`re not using the default region
        let s3Client = region ? _createS3ClientForNonDefaultRegion(region) : this.s3

        const params = {
            Key: fileName,
            Body: fileBuffer,
            Bucket: bucket
        }

        return s3Client.putObject(params).promise()
    }

    /**
     * Get the standard url for an object put in S3
     * @param {name of objet in S3} fileName
     * @param {name of bucket where the object was put} bucket
     * @param {if specified, overrides the default spark region} region
     */
    getObjectUrl(fileName, bucket, region = awsConfig.defualt_region) {
        return `https://s3-${region}.amazonaws.com/${bucket}/${fileName}`
    }

    /**
     * Get a presigned Url to the object, to reuse the server-side credentials.
     * @param {name of object in S3} fileName
     * @param {name of bucket where object was put} bucket
     * @param {if specified, overrides the default spark region} region
     */
    getPresignedUrl(fileName, bucket, region = awsConfig.defualt_region) {
        const presignedUrl = this.s3.getSignedUrl('getObject', {
            Bucket: bucket,
            Key: fileName,
            Expires: awsConfig.presignedUrlExpireSeconds
        })

        return presignedUrl
    }

    deleteObject(fileName, bucket, region = awsConfig.defualt_region) {
        const params = {
            Bucket: bucket,
            Key: fileName
        }
        return this.s3.deleteObject(params).promise()
    }

    listBucket(bucketName, prefix, region = awsConfig.defualt_region) {
        const params = {
            Bucket: bucketName,
            Prefix: prefix
        }
        return this.s3.listObjects(params).promise()
    }

    getObject(bucketName, objectKey) {
        const params = {
            Bucket: bucketName,
            Key: objectKey
        }

        return this.s3.getObject(params).promise()
    }

    getObjectStream(bucketName, objectKey) {
        const params = {
            Bucket: bucketName,
            Key: objectKey
        }

        return this.s3.getObject(params).createReadStream()
    }

    async streamZipDataTo(params, callback) {

        let zip = new Archiver.create('zip') //eslint-disable-line new-cap
        zip.on('error', (err) => {
            pipe.status(500).json({
                error: true,
                message: "Failed to download zip file: " + err
            })
        })

        zip.pipe(params.pipe)

        // Set response headers
        params.pipe.attachment('camp-files.zip')
        let self = this

        let fileList = await this.listBucket(params.bucket, params.prefix)
        fileList.Contents.map((file) => {
            let fileList = []
            let fileObj = self.getObjectStream(params.bucket, file.Key)
            let name = self.calculateFileName(file)

            if (name === "") {
                return file
            } else {
                zip.append(fileObj, {name: name})
                fileList.push(file)
                return file
            }
        })
        
        zip.finalize()
    }

    /**
     * This function is for the off chance
     * that we need to use a different region for some reaosn.
     * During regular use we reuse the client instance using the default region.
     * @param {alternate region} region
     */
    _createS3ClientForNonDefaultRegion (region) {
        return new AWS.S3({region: region})
    }

    calculateFileName(file) {
        let name = file.Key.split('/')
        name.shift()
        name = name.join('/')
        return name
    }
}

module.exports = s3Client;

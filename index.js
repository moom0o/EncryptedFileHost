const express = require('express')
const config = require('./config.json')
const fs = require("fs")
const upload = require('express-fileupload');
const bodyParser = require('body-parser');
const rand = require('random-id');
const mime = require('mime-types');
const {Readable} = require('stream');
const path = require("path")

const crypto = require('crypto');
require('path');
const zlib = require('zlib');

const AppendInitVect = require('./appendInitVect');

let cooldown = new Set();
let bandwidth = 0;
fs.readFile('./bandwidth.json', 'utf8', (err, data) => {
    if (err) {
        console.log(err);
    } else {
        bandwidth = JSON.parse(data).bandwidth;
    }
});
const app = express()

app.use(express.static('public'))
app.use(upload({preserveExtension: true, safeFileNames: true, limits: {fileSize: 10000000000000000000 * 1024 * 1024}}));
app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));

setInterval(() => {
    // write bandwidth
    fs.writeFile('bandwidth.json', {"bandwidth": bandwidth}, (err) => {
        if (err) throw err;
    });
}, 10 * 60 * 1000)

app.post('/upload', function (req, res) {
    const file = req.files.file;
    let password;
    if (req.query["randomKey"]) {
        password = rand(10, 'aA0');
    } else {
        password = req.body.key;
    }
    const id = rand(6, 'aA0');
    const ext = mime.extension(file.mimetype);
    let e = ext.toLowerCase()
    const fileName = id + '.' + ext;
    if (e.includes("htm") || e.includes("php") || e.includes("xml")) {
        return res.status(403).send("File extension not allowed")
    }
    if (config.Cloudflare) {
        if (cooldown.has(req.headers['x-forwarded-for']) && req.header("auth") !== config.BypassCooldownToken) {
            return res.status(429).send("You can only upload a file every 15 seconds.")
        } else {
            cooldown.add(req.headers['x-forwarded-for'])
            setTimeout(() => {
                cooldown.delete(req.headers['x-forwarded-for'])
            }, 15 * 1000)
        }
    } else {
        if (cooldown.has(req.connection.remoteAddress) && req.header("auth") !== config.BypassCooldownToken) {
            return res.status(429).send("You can only upload a file every 15 seconds.")
        } else {
            cooldown.add(req.connection.remoteAddress)
            setTimeout(() => {
                cooldown.delete(req.connection.remoteAddress)
            }, 15 * 1000)
        }
    }

    encrypt(file, password, fileName)
    if (req.query["randomKey"]) {
        res.send(`https://${req.headers.host}/${fileName}?key=${password}`);
    } else {
        res.send(`<a href="https://${req.headers.host}/${fileName}?key=${password}"><a href="https://${req.headers.host}/${fileName}?key=${password}</a>`);
    }
})

// legacy
app.get('/decrypt', function (req, res) {
    const fileName = req.query.id;
    const password = req.query.key;
    if (fs.existsSync(__dirname + "/files/" + fileName + ".enc")) {
        decrypt(fileName, password, res)
    } else {
        res.status(404).send("File does not exist")
    }
})

app.get('/totalsize', function (req, res) {
    res.set('Cache-control', 'public, max-age=0').send({
        "usage": convertBytes(getTotalSize("./files")),
        "bandwidth": convertBytes(bandwidth)
    });
})

app.get('/:filename', function (req, res) {
    const fileName = req.params.filename;
    const password = req.query.key;
    if (fs.existsSync(__dirname + "/files/" + fileName + ".enc")) {
        decrypt(fileName, password, res)
    } else {
        res.status(404).send("File does not exist")
    }
})

app.listen(config.port, config.bindIP)

const getAllFiles = function (dirPath, arrayOfFiles) {
    let files = fs.readdirSync(dirPath)

    arrayOfFiles = arrayOfFiles || []

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles)
        } else {
            arrayOfFiles.push(path.join(__dirname, dirPath, file))
        }
    })

    return arrayOfFiles
}

const getTotalSize = function (directoryPath) {
    const arrayOfFiles = getAllFiles(directoryPath)

    let totalSize = 0

    arrayOfFiles.forEach(function (filePath) {
        totalSize += fs.statSync(filePath).size
    })

    return totalSize
}

const convertBytes = function (bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]

    if (bytes === 0) {
        return "n/a"
    }

    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))

    if (i === 0) {
        return bytes + " " + sizes[i]
    }

    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i]
}

function encrypt(file, password, name) {
    const initVect = crypto.randomBytes(16);

    const CIPHER_KEY = getCipherKey(password);

    const readStream = Readable.from(file.data);
    const gzip = zlib.createGzip();
    const cipher = crypto.createCipheriv('aes256', CIPHER_KEY, initVect);
    const appendInitVect = new AppendInitVect(initVect);
    const writeStream = fs.createWriteStream(__dirname + "/files/" + name + ".enc");
    readStream
        .pipe(gzip)
        .pipe(cipher)
        .pipe(appendInitVect)
        .pipe(writeStream)
}

function decrypt(file, password, res) {
    const readInitVect = fs.createReadStream(__dirname + "/files/" + file + ".enc", {end: 15});

    let initVect;
    readInitVect.on('data', (chunk) => {
        initVect = chunk;
    });

    readInitVect.on('close', () => {
        const cipherKey = getCipherKey(password);
        const readStream = fs.createReadStream(__dirname + "/files/" + file + ".enc", {start: 16});
        const decipher = crypto.createDecipheriv('aes256', cipherKey, initVect);
        const unzip = zlib.createUnzip();
        const writeStream = fs.createWriteStream(__dirname + "/files/" + file);

        let pipeshit = readStream
            .pipe(decipher)
            .pipe(unzip)
            .pipe(writeStream);
        unzip.on('error', function (err) {
            res.status(500).send("Failed to decompress, probably wrong key?")
            res.end(err);
            fs.unlinkSync(__dirname + "/files/" + file)
        })
        pipeshit.on("finish", () => {
            fs.stat(__dirname + "/files/" + file, (err, stats) => {
                if (err) {
                    console.log(`File doesn't exist.`);
                } else {
                    bandwidth = bandwidth + stats.size;
                }
            });
            res.header("abuse", config.abuseHeaderMessage).sendFile(__dirname + "/files/" + file, function (error) {
                if (error) {
                    console.log(error)
                    res.status(500).end("Error!")
                }
                fs.unlinkSync(__dirname + "/files/" + file)
            })
        })

    });
}

function getCipherKey(password) {
    return crypto.createHash('sha256').update(password).digest();
}

process.on('uncaughtException', function (err) {
});

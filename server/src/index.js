const express = require('express')
const multiparty = require('multiparty')
const fse = require('fs-extra')
const cors = require('cors')
const bodyParser = require('body-parser')
const { resolve } = require('path')


const app = express()

// 获取文件后缀
const extractExt = (filename) => {
  return filename.slice(filename.lastIndexOf('.'), filename.length)
}
app.use(bodyParser.json())
app.use(cors())
app.get('/upload', (req, res) => {
  console.log(1)
  res.send('1')
})
const UPLOAD_DIR = resolve(__dirname, "../upload")
app.post('/upload', (req, res) => {
  const form = new multiparty.Form()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.send({
        ok: false,
        msg: "上次失败，请重新上传",
        status: 401
      })
    }
    const chunkHash = fields['chunkHash'][0]
    const fileHash = fields['fileHash'][0]
    // 临时存放目录
    const filePath = resolve(UPLOAD_DIR, fileHash)
    if (!fse.existsSync(filePath)) {
      console.log(filePath, 312)
      await fse.mkdir(filePath)
    }
    // 放入切片
    const oldPath = files['chunk'][0]['path']
    await fse.move(oldPath, resolve(filePath, chunkHash))
    res.send({
      ok: true,
      fields,
      files,
      status: 200
    })
  })
})
app.post('/merge', async (req, res) => {
  const { fileHash, fileName, size } = req.body
  console.log(fileHash, fileName, size)
  // 上传的文件
  const filePath = resolve(UPLOAD_DIR, fileHash + extractExt(fileName))
  // 存在就不合并了
  if (fse.existsSync(filePath)) {
    res.end({
      ok: true,
      msg: '合并成功'
    })
    return
  }
  // 不存在就合并文件
  const chunkDir = resolve(UPLOAD_DIR, fileHash)
  // 没有分片
  if (!fse.existsSync(chunkDir)) {
    res.end({
      ok: false,
      msg: '合并失败，请重新上传'
    })
    return
  }
  const chunkPaths = await fse.readdir(chunkDir)
  chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1])
  // 读写流的操作
  const list = chunkPaths.map((path, index) => {
    const chunkPath = resolve(chunkDir, path)
    const readStream = fse.createReadStream(chunkPath)
    const writeStream = fse.createWriteStream(filePath, {
      start: index * size,
      end: (index + 1) * size
    })
    readStream.on('end', async () => {
      await fse.unlink(chunkPath)
      res.end(JSON.stringify({
        ok: false,
        msg: '合并失败，请重新上传'
      }))
    })
    readStream.pipe(writeStream)
  })

})

app.post('/check', async (req, res) => {
  const { fileHash, fileName } = req.body
  let filePath = resolve(UPLOAD_DIR, fileHash + extractExt(fileName))
  // 存在这个文件就不合并了
  if (fse.existsSync(filePath)) {
    res.end(JSON.stringify({
      ok: true,
      showUpload: false
    }))
    return
  }
  // 是否upload存在这个文件夹
  filePath = resolve(UPLOAD_DIR, fileHash)
  if (fse.existsSync(filePath)) {
    // 存在读取分片,返回已存在的分片
    const chunkPaths = await fse.readdir(filePath)
    res.end(JSON.stringify({
      ok: true,
      showUpload: true,
      chunkPaths
    }))
    return
  }
  // 都没有的话
  res.end(JSON.stringify({
    ok: true,
    showUpload: true,
    chunkPaths: []
  }))
})
app.listen(3000, () => {
  console.log('Server is on http://localhost:3000')
})
<template>
  <div>
    <input @change="handleUpload" type="file" />
  </div>
</template>

<script setup>
import SparkMD5 from "spark-md5";
import { ref } from "vue";

const fileName = ref("");
const fileHash = ref("");
const CHUNK_SIZE = 10 * 1024; // 1M一个分片
// 创建分片
const createChunk = (file) => {
  let cur = 0; // 切片
  const chunks = [];
  while (cur < file.size) {
    const blob = file.slice(cur, cur + CHUNK_SIZE);
    chunks.push(blob);
    cur += CHUNK_SIZE;
  }
  return chunks;
};
// 计算哈希
const calculateHash = (chunks) => {
  // 1.计算第一个和最后一个的全部内容
  // 2.计算中间部分前中后的两个字节
  return new Promise((resolve) => {
    const target = [];
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();
    chunks.forEach((chunk, index) => {
      // 第一个和最后一个分片的所有内容用于机选
      if (index === 0 || index === chunks.length - 1) {
        target.push(chunk);
      } else {
        // 中间部分区前中后的两个字节
        target.push(chunk.slice(0, 2));
        target.push(chunk.slice(CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 2));
        target.push(chunk.slice(CHUNK_SIZE - 2, CHUNK_SIZE));
      }
    });
    fileReader.onload = (e) => {
      spark.append(e.target.result);
      const hash = spark.end();
      resolve(hash);
    };
    fileReader.readAsArrayBuffer(new Blob(target));
  });
};
// 上传分片
const uplaodChunks = async (chunks, chunkPaths) => {
  // 1.收集信息
  const data = chunks.map((chunk, index) => {
    return {
      chunkHash: fileHash.value + "_" + index,
      fileHash: fileHash.value,
      chunk,
    };
  });

  // 2.组装formdata
  const formData = data
    .filter((item) => {
      return !chunkPaths.includes(item.chunkHash);
    })
    .map((item) => {
      const _formData = new FormData();
      const { chunkHash, fileHash, chunk } = item;
      _formData.append("chunkHash", chunkHash);
      _formData.append("fileHash", fileHash);
      _formData.append("chunk", chunk);
      return _formData;
    });
  console.log(formData);
  const max = 6; // 请求并发数
  const fetchTaskPool = []; // 请求池
  let index = 0;
  while (index < formData.length) {
    const fetchTask = fetch("http://localhost:3000/upload", {
      method: "POST",
      body: formData[index],
    });

    fetchTaskPool.push(fetchTask);
    // 达到最大请求数
    if (fetchTaskPool.length === max) {
      await Promise.race(fetchTaskPool);
      // 删除一个
      const index = fetchTaskPool.findIndex((item) => item === fetchTask);
      fetchTaskPool.splice(index, 1);
    }
    index++;
  }
  await Promise.all(fetchTaskPool);
  // 通知合并分片
  mergeRequest();
};
// 合并分片
const mergeRequest = () => {
  fetch("http://localhost:3000/merge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fileHash: fileHash.value,
      fileName: fileName.value,
      size: CHUNK_SIZE,
    }),
  }).then(() => {
    alert("合并成功");
  });
};
// 检查分片
const checkChunks = () => {
  return new Promise((resolve) => {
    fetch("http://localhost:3000/check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileHash: fileHash.value,
        fileName: fileName.value,
      }),
    }).then((res) => {
      // console.log(res)
      // debugger
      res.json().then((aaa) => {
        console.log(aaa);
        resolve(aaa);
      });
    });
  });
};
const handleUpload = async (e) => {
  const files = e.target.files;
  if (!files) return;
  fileName.value = files[0].name;
  const chunks = createChunk(files[0]);
  // hash计算
  fileHash.value = await calculateHash(chunks);
  console.log(fileHash.value);
  // 检查分片
  let data = await checkChunks();
  const { showUpload, chunkPaths } = data;
  if (!showUpload) {
    return alert("上传成功");
  }
  // 上传分片
  uplaodChunks(chunks, chunkPaths);
};
</script>

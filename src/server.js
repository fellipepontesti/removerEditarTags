const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const app = express();

const tempDir = path.join(__dirname, 'temp_files');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const requestDir = path.join(tempDir, req.requestDir);
    if (!fs.existsSync(requestDir)) {
      fs.mkdirSync(requestDir);
    }
    cb(null, requestDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use((req, res, next) => {
  req.requestDir = uuidv4();
  next();
});

function removeFilesAfterTimeout(directory) {
  setTimeout(() => {
    fs.rm(directory, { recursive: true, force: true }, (err) => {
      if (err) throw err;
      console.log(`Diretório ${directory} removido após 30 minutos`);
    });
  }, 30 * 60 * 1000);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/remover.html'));
});

app.post('/upload', upload.array('xmlFiles'), (req, res) => {
  const tagsToRemove = req.body.tagsToRemove.split(',');
  const arquivosModificados = [];
  let totalTagsRemovidas = 0;

  req.files.forEach(file => {
    let fileContent = fs.readFileSync(file.path, 'utf-8');

    tagsToRemove.forEach(tag => {
      const regex = new RegExp(`<${tag}>.*?</${tag}>`, 'g');
      const matches = fileContent.match(regex) || [];
      totalTagsRemovidas += matches.length;
      fileContent = fileContent.replace(regex, '');
    });

    const modifiedFilePath = path.join(tempDir, req.requestDir, `${file.originalname}`);
    fs.writeFileSync(modifiedFilePath, fileContent);
    arquivosModificados.push(modifiedFilePath);
  });

  const zipFileName = 'arquivos_modificados.zip';
  const zipPath = path.join(tempDir, req.requestDir, zipFileName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  arquivosModificados.forEach(file => {
    archive.append(fs.createReadStream(file), { name: path.basename(file) });
  });

  archive.finalize();

  removeFilesAfterTimeout(path.join(tempDir, req.requestDir));

  output.on('close', () => {
    res.json({
      message: 'Arquivos modificados com sucesso!',
      totalTagsRemovidas: totalTagsRemovidas,
      downloadLink: `http://localhost:3000/temp_files/${req.requestDir}/arquivos_modificados.zip`
    });
  });
});

app.get('/temp_files/:requestDir/arquivos_modificados.zip', (req, res) => {
  const zipPath = path.join(tempDir, req.params.requestDir, 'arquivos_modificados.zip');
  res.download(zipPath, 'arquivos_modificados.zip', (err) => {
    if (err) {
      console.error('Erro ao baixar o arquivo:', err);
    }
  });
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
